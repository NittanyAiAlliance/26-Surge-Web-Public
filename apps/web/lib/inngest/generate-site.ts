import { inngest } from "./client"
import {
  stepScrapeWebsite,
  stepScaffold,
  stepHomepage,
  stepPage,
  stepFinalize,
} from "../generation-steps"
import type { GeneratedFile } from "../claude"
import type { BusinessProfile } from "@radiant/scraper"
import type { GenerationContext, GenerationMode } from "../types/generation"
import { getPagesForMode } from "../types/generation"
import {
  getProject,
  getProjectFiles,
  updateProject,
  logGeneration,
} from "@radiant/db"

interface PipelineEventData {
  projectId: string
  mode?: GenerationMode
  customInstructions?: string
}

interface StartedEventData extends PipelineEventData {
  businessProfile?: BusinessProfile
  projectName?: string
  customContext?: string
  resumeText?: string
  portfolioPreferences?: string
}

const SCAFFOLD_FILE_PATHS = new Set([
  "app/layout.tsx",
  "components/Nav.tsx",
  "components/Footer.tsx",
  "tailwind.config.ts",
  "app/globals.css",
])

async function markPipelineFailed(projectId: string, error: Error) {
  console.error(`[inngest] pipeline failed for project ${projectId}:`, error.message)

  try {
    await updateProject(projectId, {
      status: "failed",
      generation_step: "failed",
      generation_percent: null,
    })
  } catch (e) {
    console.error("[inngest] Failed to update project status:", e)
  }

  try {
    await logGeneration(
      projectId,
      {
        system_prompt: "inngest_failure",
        user_prompt: "",
        prompt_hash: "inngest_failure",
      },
      null,
      {
        status: "failed",
        error: error.message,
        generation_step: "full",
      }
    )
  } catch (e) {
    console.error("[inngest] Failed to log generation failure:", e)
  }
}

function getProjectIdFromFailureEvent(event: unknown): string | null {
  const originalEvent = (event as { data?: { event?: { data?: { projectId?: string } } } })?.data?.event
  return originalEvent?.data?.projectId ?? null
}

async function loadGenerationContext(projectId: string): Promise<GenerationContext> {
  const project = await getProject(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)
  const config = (project.config as Record<string, unknown>) ?? {}
  const mode = (config.mode as GenerationMode) ?? "business"
  return {
    mode,
    projectName: (config.projectName ?? config.name ?? "Untitled") as string,
    businessProfile: mode === "business" ? config as unknown as BusinessProfile : undefined,
    customContext: config.customContext as string | undefined,
    customInstructions: config.customInstructions as string | undefined,
    resumeText: config.resumeText as string | undefined,
    portfolioPreferences: config.portfolioPreferences as string | undefined,
  }
}

async function loadScaffoldFiles(projectId: string): Promise<GeneratedFile[]> {
  const files = await getProjectFiles(projectId)
  const scaffoldFiles = files
    .filter((file) => SCAFFOLD_FILE_PATHS.has(file.file_path))
    .map((file) => ({ path: file.file_path, content: file.content }))

  if (scaffoldFiles.length === 0) {
    throw new Error(`Missing scaffold files for project ${projectId}`)
  }

  return scaffoldFiles
}

function createPipelineFunction<TData extends PipelineEventData | StartedEventData>(
  id: string,
  eventName: string,
  handler: (data: TData) => Promise<void>
) {
  return inngest.createFunction(
    {
      id,
      retries: 0,
      cancelOn: [{ event: "site/generation.cancelled", match: "data.projectId" }],
      onFailure: async ({ error, event }) => {
        const projectId = getProjectIdFromFailureEvent(event)
        if (!projectId) {
          console.error("[inngest] onFailure: could not extract projectId", error.message)
          return
        }
        await markPipelineFailed(projectId, error)
      },
    },
    { event: eventName },
    async ({ event }) => {
      await handler(event.data as TData)
    }
  )
}

export const scrapeSiteFunction = createPipelineFunction<StartedEventData>(
  "generate-site-scrape",
  "site/generation.started",
  async ({ projectId, businessProfile, mode, customInstructions }) => {
    console.log("[inngest] starting function", { projectId, function: "scrape", mode })
    if (mode && mode !== "business") {
      // Non-business modes skip scraping
      await inngest.send({ name: "site/generation.scraped", data: { projectId, mode, customInstructions } })
      return
    }
    if (businessProfile) {
      await stepScrapeWebsite(projectId, businessProfile, mode)
    }
    await inngest.send({ name: "site/generation.scraped", data: { projectId, mode, customInstructions } })
  }
)

export const scaffoldSiteFunction = createPipelineFunction<PipelineEventData>(
  "generate-site-scaffold",
  "site/generation.scraped",
  async ({ projectId, mode }) => {
    console.log("[inngest] starting function", { projectId, function: "scaffold" })
    const context = await loadGenerationContext(projectId)
    await stepScaffold(projectId, context)
    await inngest.send({ name: "site/generation.scaffolded", data: { projectId, mode } })
  }
)

export const homepageSiteFunction = createPipelineFunction<PipelineEventData>(
  "generate-site-homepage",
  "site/generation.scaffolded",
  async ({ projectId, mode }) => {
    console.log("[inngest] starting function", { projectId, function: "homepage" })
    const [context, scaffoldFiles] = await Promise.all([
      loadGenerationContext(projectId),
      loadScaffoldFiles(projectId),
    ])
    await stepHomepage(projectId, context, scaffoldFiles)
    await inngest.send({ name: "site/generation.homepage_done", data: { projectId, mode } })
  }
)

export const additionalPagesSiteFunction = createPipelineFunction<PipelineEventData>(
  "generate-site-pages",
  "site/generation.homepage_done",
  async ({ projectId, mode }) => {
    console.log("[inngest] starting function", { projectId, function: "pages" })
    const [context, scaffoldFiles] = await Promise.all([
      loadGenerationContext(projectId),
      loadScaffoldFiles(projectId),
    ])

    const additionalPages = getPagesForMode(context)

    if (additionalPages.length === 0) {
      // Portfolio mode — no additional pages
      await inngest.send({ name: "site/generation.pages_done", data: { projectId, mode } })
      return
    }

    for (const [index, page] of additionalPages.entries()) {
      const percent = Math.round(60 + ((index + 1) / additionalPages.length) * 30)
      await stepPage(projectId, context, scaffoldFiles, page, percent)
    }

    await inngest.send({ name: "site/generation.pages_done", data: { projectId, mode } })
  }
)

export const finalizeSiteFunction = createPipelineFunction<PipelineEventData>(
  "generate-site-finalize",
  "site/generation.pages_done",
  async ({ projectId }) => {
    console.log("[inngest] starting function", { projectId, function: "finalize" })
    await stepFinalize(projectId)
    console.log("[inngest] pipeline finished", { projectId })
  }
)
