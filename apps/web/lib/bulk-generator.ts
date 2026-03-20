/**
 * Bulk Website Generator — orchestrates parallel generation of multiple sites.
 *
 * Calls existing pipeline functions directly (scraper, generator, deployer)
 * without going through HTTP routes, bypassing IP-based rate limits.
 */

import { scrapeBusinessProfile } from "@radiant/scraper"
import type { BusinessProfile } from "@radiant/scraper"
import { createProject, updateProject } from "@radiant/db"
import { generateSite } from "./generator"
import { deployProject } from "./deployer"

// ── Types ────────────────────────────────────────────────

export interface BulkBusinessInput {
  /** Business name for Google Places search */
  name: string
  /** City, State or full address */
  location: string
  /** Additional context injected into generation prompts */
  customContext?: string
}

export interface BulkSiteResult {
  index: number
  name: string
  status: "deployed" | "failed" | "timeout"
  projectId?: string
  subdomain?: string
  url?: string
  error?: string
  duration: number
}

export interface BulkProgress {
  index: number
  name: string
  step: "scraping" | "creating" | "generating" | "deploying" | "complete" | "error"
  message: string
  percent?: number
}

export interface BulkBatchSummary {
  total: number
  succeeded: number
  failed: number
  results: BulkSiteResult[]
}

export interface BulkGenerateOptions {
  /** Supabase user ID to own all generated projects */
  userId: string
  /** Max concurrent site generations (default: 3) */
  concurrency?: number
  /** Called for each progress event */
  onProgress?: (progress: BulkProgress) => void
  /** Called when a single site finishes (success or failure) */
  onSiteComplete?: (result: BulkSiteResult) => void
}

// ── Helpers ──────────────────────────────────────────────

// slugify removed — use findAvailableSubdomain from @/lib/subdomain

/** Run async tasks with a concurrency limit. Each task is independent. */
async function promisePool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>()
  for (let i = 0; i < items.length; i++) {
    const p = fn(items[i], i).finally(() => executing.delete(p))
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
}

// ── Single Site Processing ───────────────────────────────

async function processSingleBusiness(
  input: BulkBusinessInput,
  index: number,
  options: BulkGenerateOptions
): Promise<BulkSiteResult> {
  const startTime = Date.now()
  const { userId, onProgress } = options

  const emit = (step: BulkProgress["step"], message: string, percent?: number) => {
    onProgress?.({ index, name: input.name, step, message, percent })
  }

  try {
    // 1. Scrape business data
    emit("scraping", `Searching Google Places for "${input.name}"...`)
    let profile: BusinessProfile
    try {
      profile = await scrapeBusinessProfile(input.name, input.location)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Scraping failed: ${msg}`)
    }

    // 2. Create project
    emit("creating", "Creating project...")
    const { findAvailableSubdomain } = await import("@/lib/subdomain")
    const subdomain = await findAvailableSubdomain(input.name)
    const project = await createProject(userId, input.name, subdomain, {
      industry: profile.industry,
      status: "draft",
    })
    const projectId = project.id

    // Store business profile + custom context in project config
    await updateProject(projectId, {
      config: {
        businessProfile: profile,
        customContext: input.customContext ?? null,
      },
    })

    // 3. Generate website
    emit("generating", "Starting generation pipeline...", 10)
    await generateSite(projectId, profile, {
      customInstructions: input.customContext,
      onProgress: (p) => {
        // Map inner generation progress to bulk progress
        emit("generating", p.detail ?? p.step)
      },
    })

    // 4. Deploy
    emit("deploying", "Deploying to Vercel...")
    const deployResult = await deployProject(projectId)

    emit("complete", `Live at ${deployResult.url}`, 100)

    return {
      index,
      name: input.name,
      status: "deployed",
      projectId,
      subdomain,
      url: deployResult.url,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    emit("error", errorMessage)
    return {
      index,
      name: input.name,
      status: "failed",
      error: errorMessage,
      duration: Date.now() - startTime,
    }
  }
}

// ── Main Orchestrator ────────────────────────────────────

/**
 * Generate and deploy multiple websites in parallel.
 *
 * @param businesses - Array of business inputs (max 10)
 * @param options - User ID, concurrency, callbacks
 * @returns Summary with per-site results
 */
export async function bulkGenerate(
  businesses: BulkBusinessInput[],
  options: BulkGenerateOptions
): Promise<BulkBatchSummary> {
  // Validate input
  if (!businesses || businesses.length === 0) {
    throw new Error("No businesses provided")
  }
  if (businesses.length > 10) {
    throw new Error("Maximum 10 businesses per batch")
  }

  for (const [i, biz] of businesses.entries()) {
    if (!biz.name || biz.name.length > 200) {
      throw new Error(`Business ${i}: name is required and must be under 200 characters`)
    }
    if (!biz.location || biz.location.length > 200) {
      throw new Error(`Business ${i}: location is required and must be under 200 characters`)
    }
    if (biz.customContext && biz.customContext.length > 2000) {
      throw new Error(`Business ${i}: customContext must be under 2000 characters`)
    }
  }

  const concurrency = options.concurrency ?? 3
  const results: BulkSiteResult[] = []

  await promisePool(businesses, concurrency, async (biz, index) => {
    const result = await processSingleBusiness(biz, index, options)
    results[index] = result
    options.onSiteComplete?.(result)
  })

  // Sort by index to maintain order
  results.sort((a, b) => a.index - b.index)

  const succeeded = results.filter((r) => r.status === "deployed").length

  return {
    total: businesses.length,
    succeeded,
    failed: businesses.length - succeeded,
    results,
  }
}
