/**
 * @deprecated This file is the legacy synchronous generation pipeline.
 * New generation requests go through Inngest (see lib/inngest/generate-site.ts).
 * This file is kept only for bulk-generator.ts which still uses the direct
 * synchronous path. It will be migrated to Inngest in a future task.
 */
import type { BusinessProfile } from "@radiant/scraper"
import { updateProject, getProject, upsertProjectFiles, deleteProjectFiles, logGeneration, getProjectFiles } from "@radiant/db"
import { generateDesignBrief, type DesignBrief } from "./design-director"
import { injectComponents, resolveDataDir } from "./component-injector"
import { buildScaffoldPrompt, buildPagePrompt } from "./prompt-builder"
import { generateWebsite } from "./claude"
import { parseAndValidate } from "./parser"
import { createHash } from "crypto"
import fs from "node:fs"
import path from "node:path"
import { MODEL_CONFIG } from "./model-config"


// ── Types ────────────────────────────────────────────────

export interface GenerationProgress {
  step: string
  detail?: string
  percent?: number
}

export interface GenerateSiteOptions {
  /** Max retry attempts for validation failures (default: 1) */
  maxRetries?: number
  /** Progress callback for real-time updates */
  onProgress?: (progress: GenerationProgress) => void
  /** Custom instructions for regeneration (e.g. "Change the color scheme to blue") */
  customInstructions?: string
}

// ── Helpers ──────────────────────────────────────────────

function hashPrompt(system: string, user: string): string {
  return createHash("sha256")
    .update(system + "\n---\n" + user)
    .digest("hex")
    .slice(0, 16)
}

function inferFileType(filePath: string): string | null {
  if (filePath.endsWith(".tsx")) return "tsx"
  if (filePath.endsWith(".ts")) return "ts"
  if (filePath.endsWith(".css")) return "css"
  if (filePath.endsWith(".json")) return "json"
  if (filePath.endsWith(".js")) return "js"
  return null
}

/** Run async tasks with a concurrency limit. Individual failures are caught and
 *  logged so that one failing task does not crash the entire batch. Failed tasks
 *  produce `null` in the returned array. */
async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = []
  const executing: Promise<void>[] = []

  for (const [index, task] of tasks.entries()) {
    const p = task()
      .then((result) => {
        results[index] = result
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[parallelLimit] Task ${index} failed: ${message}`)
        results[index] = null
      })
    const e: Promise<void> = p.then(() => {
      executing.splice(executing.indexOf(e), 1)
    })
    executing.push(e)

    if (executing.length >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

// ── Post-generation validation ───────────────────────────

const ANIMATED_IMPORT_RE = /from\s+["']@\/components\/animated\/([^"']+)["']/g

const KNOWN_LIBRARIES_LIST = ["aceternity", "magic-ui", "21st-dev"]

/**
 * Scan all project files for imports of `@/components/animated/*` and ensure
 * each imported component actually exists in project_files. If a component is
 * missing, attempt to recover it from the on-disk data/components/ directory.
 *
 * This acts as a safety net for cases where `injectComponents()` silently
 * failed (e.g. because `resolveDataDir()` couldn't find the data directory).
 */
async function validateAndRecoverAnimatedComponents(
  projectId: string
): Promise<void> {
  const files = await getProjectFiles(projectId)

  // Build a set of existing animated component paths
  const existingPaths = new Set(files.map((f) => f.file_path))

  // Scan all files for animated component imports
  const requiredComponents = new Set<string>()
  for (const file of files) {
    if (!file.content) continue
    let match: RegExpExecArray | null
    // Reset regex state for each file
    const re = new RegExp(ANIMATED_IMPORT_RE.source, "g")
    while ((match = re.exec(file.content)) !== null) {
      // match[1] is e.g. "wobble-card" or "wobble-card.tsx"
      let name = match[1]
      // Strip .tsx extension if present in the import
      if (name.endsWith(".tsx")) name = name.slice(0, -4)
      requiredComponents.add(name)
    }
  }

  if (requiredComponents.size === 0) return

  // Check which are missing
  const missing: string[] = []
  for (const name of requiredComponents) {
    const targetPath = `components/animated/${name}.tsx`
    if (!existingPaths.has(targetPath)) {
      missing.push(name)
    }
  }

  if (missing.length === 0) return

  console.warn(
    `[generator] Found ${missing.length} missing animated component(s): ${missing.join(", ")}. Attempting recovery...`
  )

  // Attempt recovery from disk
  const dataDir = resolveDataDir()
  const recovered: Array<{ file_path: string; content: string; file_type: "tsx" }> = []

  for (const name of missing) {
    let found = false
    for (const library of KNOWN_LIBRARIES_LIST) {
      const tsxPath = path.join(dataDir, library, `${name}.tsx`)
      try {
        if (fs.existsSync(tsxPath)) {
          const content = fs.readFileSync(tsxPath, "utf-8")
          recovered.push({
            file_path: `components/animated/${name}.tsx`,
            content,
            file_type: "tsx" as const,
          })
          console.warn(`[generator] Recovered missing animated component: ${name} (from ${library})`)
          found = true
          break
        }
      } catch (err) {
        // Continue trying other libraries
      }
    }
    if (!found) {
      console.error(
        `[generator] Could not recover animated component "${name}" — ` +
          `not found in any library directory under ${dataDir}`
      )
    }
  }

  // Upsert recovered files into project_files
  if (recovered.length > 0) {
    await upsertProjectFiles(projectId, recovered)
    console.warn(
      `[generator] Successfully recovered ${recovered.length}/${missing.length} missing animated component(s)`
    )
  }
}

// ── Main orchestrator ────────────────────────────────────

/**
 * Generate a complete website for a business using multi-step orchestration.
 *
 * Pipeline:
 * 1. Update project status to "generating"
 * 2. Design Director — Opus call to decide personality, colors, fonts, components, page structure
 * 3. Component Injection — copy pre-built animated .tsx files into the project
 * 4. Scaffold Generation — Sonnet call 1: layout, nav, footer, config, globals
 * 5. Homepage Generation — Sonnet call 2: homepage with all sections
 * 6. Additional Pages — Haiku calls in parallel: one per additional page
 * 7. Update project status to "preview"
 *
 * On error: status -> "failed", generation logged with error details.
 */
export async function generateSite(
  projectId: string,
  profile: BusinessProfile,
  options?: GenerateSiteOptions
): Promise<void> {
  // Wrap onProgress so a broken or disconnected callback can NEVER kill the
  // generation pipeline.  If the caller's callback throws (e.g. the SSE
  // controller is already closed because the client navigated away), we
  // silently swallow the error and continue generating.
  const safeProgress: ((p: GenerationProgress) => void) | undefined =
    options?.onProgress
      ? (p: GenerationProgress) => {
          try {
            options.onProgress!(p)
          } catch {
            // Swallow — the generation must survive a broken callback
          }
        }
      : undefined

  try {
    // Step 1: Update project status to "generating"
    await updateProject(projectId, { status: "generating" })

    // Step 2: Design Director (Opus call)
    safeProgress?.({ step: "designing", detail: "AI is choosing design direction, colors & layout...", percent: 5 })
    const brief: DesignBrief = await generateDesignBrief(profile, options?.customInstructions)

    // Store brief in project config
    const project = await getProject(projectId)
    const existingConfig = (project?.config as Record<string, unknown>) ?? {}
    await updateProject(projectId, {
      config: { ...existingConfig, designBrief: brief },
    })

    // Log the design director call
    await logGeneration(
      projectId,
      {
        system_prompt: "design-director",
        user_prompt: JSON.stringify(brief),
        prompt_hash: hashPrompt("design-director", JSON.stringify(brief)),
      },
      JSON.stringify(brief),
      {
        model: MODEL_CONFIG.designDirector.model,
        status: "completed",
      }
    )

    // Step 3: Inject Pre-Built Components
    safeProgress?.({ step: "designing_done", detail: "Design brief complete", percent: 15 })
    safeProgress?.({ step: "components", detail: "Injecting animated components...", percent: 17 })
    const injection = injectComponents(brief.components)

    // Clean slate — remove old project files
    await deleteProjectFiles(projectId)

    // Store injected component files
    if (injection.files.length > 0) {
      await upsertProjectFiles(
        projectId,
        injection.files.map((f) => ({
          file_path: f.targetPath,
          content: f.content,
          file_type: "tsx" as const,
        }))
      )
    }

    // Step 4: Scaffold Generation (Sonnet Call 1)
    safeProgress?.({ step: "scaffold", detail: "Building layout, nav & footer...", percent: 20 })
    const scaffoldPrompt = buildScaffoldPrompt(profile, options?.customInstructions)
    const scaffoldResult = await generateWebsite(scaffoldPrompt.system, scaffoldPrompt.user, {
      step: "scaffold",
      cacheOptions: scaffoldPrompt.systemStatic && scaffoldPrompt.systemDynamic
        ? { staticPart: scaffoldPrompt.systemStatic, dynamicPart: scaffoldPrompt.systemDynamic }
        : undefined,
    })
    const scaffoldParsed = parseAndValidate(scaffoldResult.rawResponse)

    if (scaffoldParsed.files.length === 0) {
      throw new Error("Scaffold generation produced no files")
    }

    await upsertProjectFiles(
      projectId,
      scaffoldParsed.files.map((f) => ({
        file_path: f.path,
        content: f.content,
        file_type: inferFileType(f.path),
      }))
    )

    await logGeneration(
      projectId,
      {
        system_prompt: scaffoldPrompt.system,
        user_prompt: scaffoldPrompt.user,
        prompt_hash: hashPrompt(scaffoldPrompt.system, scaffoldPrompt.user),
      },
      scaffoldResult.rawResponse,
      {
        model: MODEL_CONFIG.scaffold.model,
        tokens_input: scaffoldResult.tokensUsed.input,
        tokens_output: scaffoldResult.tokensUsed.output,
        duration_ms: scaffoldResult.duration,
        status: "completed",
      }
    )

    // Step 5: Homepage Generation (Sonnet Call 2)
    const homePage = brief.pages.structure.find((p) => p.path === "/")
    if (!homePage) {
      throw new Error("Design brief has no homepage")
    }

    safeProgress?.({ step: "scaffold_done", detail: "Site structure ready", percent: 35 })

    safeProgress?.({ step: "homepage", detail: "Creating homepage...", percent: 38 })
    const homePrompt = buildPagePrompt(
      profile,
      scaffoldParsed.files,
      homePage,
      options?.customInstructions
    )
    const homeResult = await generateWebsite(homePrompt.system, homePrompt.user, {
      step: "homepage",
      cacheOptions: homePrompt.systemStatic && homePrompt.systemDynamic
        ? { staticPart: homePrompt.systemStatic, dynamicPart: homePrompt.systemDynamic }
        : undefined,
    })
    const homeParsed = parseAndValidate(homeResult.rawResponse)

    if (homeParsed.files.length === 0) {
      throw new Error("Homepage generation produced no files")
    }

    await upsertProjectFiles(
      projectId,
      homeParsed.files.map((f) => ({
        file_path: f.path,
        content: f.content,
        file_type: inferFileType(f.path),
      }))
    )

    await logGeneration(
      projectId,
      {
        system_prompt: homePrompt.system,
        user_prompt: homePrompt.user,
        prompt_hash: hashPrompt(homePrompt.system, homePrompt.user),
      },
      homeResult.rawResponse,
      {
        model: MODEL_CONFIG.homepage.model,
        tokens_input: homeResult.tokensUsed.input,
        tokens_output: homeResult.tokensUsed.output,
        duration_ms: homeResult.duration,
        status: "completed",
      }
    )

    safeProgress?.({ step: "homepage_done", detail: "Homepage complete", percent: 60 })

    // Step 6: Additional Pages (PARALLEL, concurrency-limited)
    // Cap additional pages to prevent resource exhaustion
    const MAX_ADDITIONAL_PAGES = 4
    const additionalPages = brief.pages.structure.filter((p) => p.path !== "/").slice(0, MAX_ADDITIONAL_PAGES)
    if (additionalPages.length > 0) {
      // Calculate per-page progress: pages occupy 60-90% range
      const pageProgressRange = 30 // 60% to 90%
      const perPageProgress = additionalPages.length > 0 ? pageProgressRange / additionalPages.length : 0
      let completedPages = 0

      const pageTasks = additionalPages.map((page, pageIndex) => async () => {
        const pageStartPercent = 60 + pageIndex * perPageProgress
        safeProgress?.({ step: "page", detail: `Creating ${page.name} page...`, percent: Math.round(pageStartPercent) })
        const pagePrompt = buildPagePrompt(
          profile,
          scaffoldParsed.files,
          page,
          options?.customInstructions
        )
        const result = await generateWebsite(pagePrompt.system, pagePrompt.user, {
          step: "additionalPages",
          cacheOptions: pagePrompt.systemStatic && pagePrompt.systemDynamic
            ? { staticPart: pagePrompt.systemStatic, dynamicPart: pagePrompt.systemDynamic }
            : undefined,
        })
        const parsed = parseAndValidate(result.rawResponse)
        completedPages++
        const donePercent = 60 + completedPages * perPageProgress
        safeProgress?.({ step: "page_done", detail: `${page.name} page complete`, percent: Math.round(donePercent) })
        return { page, prompt: pagePrompt, result, parsed }
      })

      const pageResults = await parallelLimit(pageTasks, 2)

      // Store all page files and log generations (skip pages that failed)
      for (const entry of pageResults) {
        if (!entry) continue // skip failed page generations
        const { prompt, result, parsed } = entry
        if (parsed.files.length > 0) {
          await upsertProjectFiles(
            projectId,
            parsed.files.map((f) => ({
              file_path: f.path,
              content: f.content,
              file_type: inferFileType(f.path),
            }))
          )
        }

        await logGeneration(
          projectId,
          {
            system_prompt: prompt.system,
            user_prompt: prompt.user,
            prompt_hash: hashPrompt(prompt.system, prompt.user),
          },
          result.rawResponse,
          {
            model: MODEL_CONFIG.additionalPages.model,
            tokens_input: result.tokensUsed.input,
            tokens_output: result.tokensUsed.output,
            duration_ms: result.duration,
            status: "completed",
          }
        )
      }
    }

    // Step 6b: Validate animated component imports
    safeProgress?.({ step: "validating", detail: "Validating components...", percent: 92 })
    try {
      await validateAndRecoverAnimatedComponents(projectId)
    } catch (validationError) {
      // Validation is a safety net — log but don't fail the generation
      console.error(
        "[generator] Component validation failed (non-fatal):",
        validationError instanceof Error ? validationError.message : String(validationError)
      )
    }

    // Step 7: Done
    safeProgress?.({ step: "complete", detail: "Done!", percent: 100 })
    await updateProject(projectId, { status: "preview" })
  } catch (error) {
    // Handle all errors: API timeout, invalid response, quota exceeded
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    // Determine specific error type for logging
    const isTimeout =
      errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")
    const isQuotaExceeded =
      errorMessage.includes("rate_limit") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("429")
    const isInvalidResponse = errorMessage.includes("no files")

    const errorDetail = isTimeout
      ? `API timeout: ${errorMessage}`
      : isQuotaExceeded
        ? `Quota exceeded: ${errorMessage}`
        : isInvalidResponse
          ? `Invalid response: ${errorMessage}`
          : errorMessage

    // Log the failed generation
    try {
      await logGeneration(
        projectId,
        {},
        null,
        {
          status: "failed",
          error: errorDetail,
        }
      )
    } catch {
      // Logging failure shouldn't mask the original error
    }

    // Update project status to "failed"
    try {
      await updateProject(projectId, { status: "failed" })
    } catch {
      // Status update failure shouldn't mask the original error
    }

    throw error
  }
}
