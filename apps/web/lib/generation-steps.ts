/**
 * Extracted pipeline step functions for the Inngest generation pipeline.
 *
 * Each function represents one discrete step of the generation flow, designed
 * to be called independently by an Inngest function with durable execution.
 * Steps update project progress in the database and return data needed by
 * subsequent steps.
 */

import type { BusinessProfile, ScrapedWebsiteData } from "@radiant/scraper"
import { scrapeWebsiteEnriched } from "@radiant/scraper"
import type { GeneratedFile } from "./claude"
import type { GenerationContext } from "./types/generation"
import {
  updateProject,
  upsertProjectFiles,
  deleteProjectFiles,
  logGeneration,
  upsertProjectSections,
  deleteProjectSections,
} from "@radiant/db"
import { buildScaffoldPromptForMode, buildPagePromptForMode } from "./prompt-builder"
import { generateWebsite } from "./claude"
import { parseAndValidate } from "./parser"
import { createHash } from "crypto"
import { MODEL_CONFIG } from "./model-config"

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

// ── Step 0: Scrape Website (Firecrawl) ───────────────────

/**
 * Scrape the business's existing website using Firecrawl.
 * Runs after user confirms the business is correct.
 * Returns the BusinessProfile enriched with existingContent.
 * Best-effort: if scraping fails, returns the original profile unchanged.
 */
export async function stepScrapeWebsite(
  projectId: string,
  profile: BusinessProfile,
  mode: string = "business",
): Promise<BusinessProfile> {
  if (mode !== "business") {
    // Non-business modes skip scraping
    await updateProject(projectId, {
      status: "generating",
      generation_step: "scrape_website",
      generation_percent: 5,
    })
    return profile
  }

  await updateProject(projectId, {
    status: "generating",
    generation_step: "scrape_website",
    generation_percent: 2,
  })

  if (!profile.website) {
    await updateProject(projectId, {
      config: profile as unknown as Record<string, unknown>,
      generation_step: "scrape_website",
      generation_percent: 5,
    })
    return profile
  }

  let scrapedContent: ScrapedWebsiteData | null = null
  try {
    scrapedContent = await scrapeWebsiteEnriched(profile.website)
  } catch {
    // Website scraping is best-effort — don't fail the pipeline
    console.warn(`[generation-steps] Firecrawl scrape failed for ${profile.website} — continuing without website content`)
  }

  if (!scrapedContent) {
    await updateProject(projectId, {
      config: profile as unknown as Record<string, unknown>,
      generation_step: "scrape_website",
      generation_percent: 5,
    })
    return profile
  }

  const existingContent = {
    headlines: scrapedContent.headings.slice(0, 10),
    descriptions: scrapedContent.paragraphs.slice(0, 10),
    services: scrapedContent.services,
    about: scrapedContent.aboutText ?? "",
    socialLinks: scrapedContent.socialLinks,
    bookingLinks: scrapedContent.bookingLinks,
    orderingLinks: scrapedContent.orderingLinks,
    importantLinks: scrapedContent.importantLinks,
    logo: scrapedContent.logo,
    colorPalette: scrapedContent.colorPalette,
    teamMembers: scrapedContent.teamMembers,
    contactInfo: scrapedContent.contactInfo,
  }

  const enrichedProfile = { ...profile, existingContent }

  await updateProject(projectId, {
    config: enrichedProfile as unknown as Record<string, unknown>,
    generation_step: "scrape_website",
    generation_percent: 5,
  })

  return enrichedProfile
}

// ── Step 1: Scaffold Generation ──────────────────────────

/**
 * Generate the scaffold files (layout, nav, footer, tailwind config, globals.css)
 * via a Sonnet call.
 *
 * Returns the parsed scaffold files array which is needed as read-only context
 * for page generation steps.
 */
export async function stepScaffold(
  projectId: string,
  context: GenerationContext,
): Promise<{ files: GeneratedFile[] }> {
  // Clean slate — remove old project files and sections
  await deleteProjectFiles(projectId)
  await deleteProjectSections(projectId)

  await updateProject(projectId, {
    generation_step: "scaffold",
    generation_percent: 20,
  })

  const scaffoldPrompt = buildScaffoldPromptForMode(context)
  const scaffoldResult = await generateWebsite(scaffoldPrompt.system, scaffoldPrompt.user, {
    step: "scaffold",
    cacheOptions:
      scaffoldPrompt.systemStatic && scaffoldPrompt.systemDynamic
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

  // Write scaffold section mappings for global editing
  const scaffoldSections = [
    { page_path: "/_global", section_name: "theme", component_path: "tailwind.config.ts", display_order: 0 },
    { page_path: "/_global", section_name: "styles", component_path: "app/globals.css", display_order: 1 },
    { page_path: "/_global", section_name: "navigation", component_path: "components/Nav.tsx", display_order: 2 },
    { page_path: "/_global", section_name: "footer", component_path: "components/Footer.tsx", display_order: 3 },
    { page_path: "/_global", section_name: "layout", component_path: "app/layout.tsx", display_order: 4 },
  ]
  await upsertProjectSections(projectId, scaffoldSections)

  await logGeneration(
    projectId,
    {
      system_prompt: scaffoldPrompt.system,
      user_prompt: scaffoldPrompt.user,
      prompt_hash: hashPrompt(scaffoldPrompt.system, scaffoldPrompt.user),
    },
    scaffoldResult.rawResponse,
    {
      tokens_input: scaffoldResult.tokensUsed.input,
      tokens_output: scaffoldResult.tokensUsed.output,
      duration_ms: scaffoldResult.duration,
      status: "completed",
      generation_step: "scaffold",
      model: MODEL_CONFIG.scaffold.model,
    }
  )

  await updateProject(projectId, {
    generation_step: "scaffold",
    generation_percent: 35,
  })

  return { files: scaffoldParsed.files }
}

// ── Step 2: Homepage Generation ──────────────────────────

/**
 * Generate the homepage via a single Sonnet call.
 *
 * Takes the scaffold files as read-only context. Uses a sensible default
 * set of homepage sections based on the business category.
 */
export async function stepHomepage(
  projectId: string,
  context: GenerationContext,
  scaffoldFiles: GeneratedFile[],
): Promise<void> {
  const defaultSections = context.mode === "portfolio"
    ? ["hero", "about", "experience", "skills", "projects", "education", "contact"]
    : ["hero", "about", "services", "reviews", "contact"]
  const homePage = { path: "/", name: "Home", sections: defaultSections }

  await updateProject(projectId, {
    generation_step: "homepage",
    generation_percent: 38,
  })

  const homePrompt = buildPagePromptForMode(
    context,
    scaffoldFiles,
    homePage,
  )

  const homeResult = await generateWebsite(homePrompt.system, homePrompt.user, {
    step: "homepage",
    cacheOptions:
      homePrompt.systemStatic && homePrompt.systemDynamic
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
      tokens_input: homeResult.tokensUsed.input,
      tokens_output: homeResult.tokensUsed.output,
      duration_ms: homeResult.duration,
      status: "completed",
      generation_step: "homepage",
      model: MODEL_CONFIG.homepage.model,
    }
  )

  // Write section mappings for the homepage
  const homepageSectionRows = defaultSections.map((sectionName, index) => {
    // Convert section name to component path: "hero" -> "components/Hero.tsx"
    const componentName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1)
    return {
      page_path: "/",
      section_name: sectionName,
      component_path: `components/${componentName}.tsx`,
      display_order: index,
    }
  })
  await upsertProjectSections(projectId, homepageSectionRows)

  await updateProject(projectId, {
    generation_step: "homepage",
    generation_percent: 60,
  })
}

// ── Step 3: Additional Page Generation ───────────────────

/**
 * Generate a single additional page via a model call.
 *
 * Called once per non-homepage page. The `percentValue` parameter is the
 * progress percentage to set after this page completes (calculated by the
 * orchestrator based on total page count).
 */
export async function stepPage(
  projectId: string,
  context: GenerationContext,
  scaffoldFiles: GeneratedFile[],
  page: { path: string; name: string; sections: string[] },
  percentValue: number,
): Promise<void> {
  await updateProject(projectId, {
    generation_step: "page",
    generation_percent: Math.round(percentValue - 5),
  })

  const pagePrompt = buildPagePromptForMode(
    context,
    scaffoldFiles,
    page,
  )
  const result = await generateWebsite(pagePrompt.system, pagePrompt.user, {
    step: "additionalPages",
    cacheOptions:
      pagePrompt.systemStatic && pagePrompt.systemDynamic
        ? { staticPart: pagePrompt.systemStatic, dynamicPart: pagePrompt.systemDynamic }
        : undefined,
  })
  const parsed = parseAndValidate(result.rawResponse)

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
      system_prompt: pagePrompt.system,
      user_prompt: pagePrompt.user,
      prompt_hash: hashPrompt(pagePrompt.system, pagePrompt.user),
    },
    result.rawResponse,
    {
      tokens_input: result.tokensUsed.input,
      tokens_output: result.tokensUsed.output,
      duration_ms: result.duration,
      status: "completed",
      generation_step: "page",
      model: MODEL_CONFIG.additionalPages.model,
    }
  )

  // Write section mappings for this page
  const pageSectionRows = page.sections.map((sectionName, index) => {
    const componentName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1)
    return {
      page_path: page.path,
      section_name: sectionName,
      component_path: `components/${componentName}.tsx`,
      display_order: index,
    }
  })
  await upsertProjectSections(projectId, pageSectionRows)

  await updateProject(projectId, {
    generation_step: "page",
    generation_percent: Math.round(percentValue),
  })
}

// ── Step 4: Finalize ─────────────────────────────────────

/**
 * Mark the project as ready for preview.
 */
export async function stepFinalize(projectId: string): Promise<void> {
  await updateProject(projectId, {
    generation_step: "validating",
    generation_percent: 92,
  })

  // Mark the project as ready for preview
  await updateProject(projectId, {
    status: "preview",
    generation_step: "complete",
    generation_percent: 100,
  })
}

// ── Step: Section Edit ────────────────────────────────────

/**
 * Generate an edited version of a single section component.
 * Called directly from the edit API route (no Inngest).
 * Returns the generated file and any warnings (diff too small, diff too large).
 */
export async function stepSectionEdit(
  projectId: string,
  componentPath: string,
  instruction: string,
  currentContent: string,
): Promise<{ file: GeneratedFile; warnings: string[] }> {
  const warnings: string[] = []

  // 1. Load scaffold files (tailwind.config, globals.css) for style context
  const { getProjectFiles } = await import("@radiant/db")
  const allFiles = await getProjectFiles(projectId)

  const tailwindFile = allFiles.find((f) => f.file_path === "tailwind.config.ts")
  const globalsFile = allFiles.find((f) => f.file_path === "app/globals.css")
  const layoutFile = allFiles.find((f) => f.file_path === "app/layout.tsx")

  const scaffoldContext = {
    tailwindConfig: tailwindFile?.content ?? "",
    globalsCss: globalsFile?.content ?? "",
    layoutFile: layoutFile?.content ?? "",
  }

  // 2. Extract condensed business data from project config
  const { getProject } = await import("@radiant/db")
  const project = await getProject(projectId)
  let businessData: Parameters<typeof import("./prompt-builder").buildSectionEditPrompt>[4]
  if (project?.config) {
    const config = project.config as Record<string, unknown>
    businessData = {
      name: config.name as string | undefined,
      address: config.address as string | undefined,
      phone: config.phone as string | undefined,
      hours: config.hours,
      category: config.category as string | undefined,
      rating: config.rating as number | undefined,
      reviewCount: config.reviewCount as number | undefined,
    }
  }

  // 3. Build section edit prompt
  const { buildSectionEditPrompt } = await import("./prompt-builder")
  const editPrompt = buildSectionEditPrompt(
    currentContent,
    componentPath,
    instruction,
    scaffoldContext,
    businessData,
  )

  // 4. Call AI model
  const result = await generateWebsite(editPrompt.system, editPrompt.user, {
    step: "sectionEdit",
    cacheOptions:
      editPrompt.systemStatic && editPrompt.systemDynamic
        ? { staticPart: editPrompt.systemStatic, dynamicPart: editPrompt.systemDynamic }
        : undefined,
  })

  const parsed = parseAndValidate(result.rawResponse)

  // 5. Validate: expect exactly 1 file
  if (parsed.files.length === 0) {
    throw new Error("Section edit produced no files")
  }

  const editedFile = parsed.files[0]

  // Validate file path matches
  if (editedFile.path !== componentPath) {
    warnings.push(`Expected path "${componentPath}" but got "${editedFile.path}" — using expected path`)
    editedFile.path = componentPath
  }

  // 6. Diff check
  const originalLines = currentContent.split("\n")
  const editedLines = editedFile.content.split("\n")
  const maxLines = Math.max(originalLines.length, editedLines.length)

  if (maxLines > 0) {
    let changedLines = 0
    for (let i = 0; i < maxLines; i++) {
      if ((originalLines[i] ?? "") !== (editedLines[i] ?? "")) {
        changedLines++
      }
    }

    const changePercent = changedLines / maxLines

    if (changedLines === 0) {
      warnings.push("No changes detected — the AI returned the same content")
    } else if (changePercent > 0.8) {
      warnings.push(`Unexpectedly large change: ${Math.round(changePercent * 100)}% of lines modified — review before saving`)
    }
  }

  // 7. Upsert the file
  await upsertProjectFiles(projectId, [
    {
      file_path: editedFile.path,
      content: editedFile.content,
      file_type: inferFileType(editedFile.path),
    },
  ])

  // 8. Log the generation
  await logGeneration(
    projectId,
    {
      system_prompt: editPrompt.system,
      user_prompt: editPrompt.user,
      prompt_hash: hashPrompt(editPrompt.system, editPrompt.user),
    },
    result.rawResponse,
    {
      tokens_input: result.tokensUsed.input,
      tokens_output: result.tokensUsed.output,
      duration_ms: result.duration,
      status: "completed",
      generation_step: "full",
      model: MODEL_CONFIG.sectionEdit.model,
    }
  )

  return { file: editedFile, warnings }
}

// ── Step: Smart Edit (AI-Routed) ──────────────────────────

interface SmartEditResult {
  edits: Array<{
    componentPath: string
    instruction: string
    warnings: string[]
  }>
  routerDecision: Array<{
    componentPath: string
    instruction: string
  }>
}

/**
 * AI-routed editing: user provides only an instruction, AI determines
 * which file(s) to edit. Uses a two-step pipeline:
 * 1. Router: metadata-only call to determine target files
 * 2. Edit: existing stepSectionEdit() for each target file
 */
export async function stepSmartEdit(
  projectId: string,
  instruction: string,
  onProgress?: (event: { status: string; file?: string; index?: number; total?: number }) => void,
): Promise<SmartEditResult> {
  // 1. Fetch project sections (metadata only — names/paths, no file content)
  const { getProjectSections, getProjectFileByPath, saveFileVersion } = await import("@radiant/db")
  const sections = await getProjectSections(projectId)

  if (sections.length === 0) {
    throw new Error("No sections found — generate a website first")
  }

  const projectStructure = sections.map((s) => ({
    pagePath: s.page_path,
    sectionName: s.section_name,
    componentPath: s.component_path,
  }))

  // 2. Call the router to determine which file(s) to edit
  onProgress?.({ status: "routing" })

  const { buildEditRouterPrompt } = await import("./prompt-builder")
  const routerPrompt = buildEditRouterPrompt(instruction, projectStructure)

  const routerResult = await generateWebsite(routerPrompt.system, routerPrompt.user, {
    step: "editRouter",
  })

  // 3. Parse the router's JSON response
  let routerDecision: Array<{ componentPath: string; instruction: string }>
  try {
    // Strip any markdown code fences the model might add
    let jsonText = routerResult.rawResponse.trim()
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
    routerDecision = JSON.parse(jsonText)

    if (!Array.isArray(routerDecision) || routerDecision.length === 0) {
      throw new Error("Router returned empty or invalid result")
    }

    // Validate each entry has the required fields
    routerDecision = routerDecision.filter((d) => {
      return (
        typeof d.componentPath === "string" &&
        typeof d.instruction === "string" &&
        d.componentPath.length > 0 &&
        d.instruction.length > 0
      )
    })

    if (routerDecision.length === 0) {
      throw new Error("Router returned no valid edit targets")
    }

    // Validate that the file paths exist in the project
    const validPaths = new Set(sections.map((s) => s.component_path))
    routerDecision = routerDecision.filter((d) => validPaths.has(d.componentPath))

    if (routerDecision.length === 0) {
      throw new Error("Router targeted files that don't exist in this project")
    }

    // Cap at 3 files max to prevent runaway edits
    if (routerDecision.length > 3) {
      routerDecision = routerDecision.slice(0, 3)
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Router returned invalid JSON: ${routerResult.rawResponse.slice(0, 200)}`)
    }
    throw error
  }

  // 4. Execute edits sequentially (to avoid race conditions on shared scaffold files)
  const edits: SmartEditResult["edits"] = []

  for (let i = 0; i < routerDecision.length; i++) {
    const target = routerDecision[i]
    onProgress?.({
      status: "editing",
      file: target.componentPath,
      index: i,
      total: routerDecision.length,
    })

    // Load current file content
    const currentFile = await getProjectFileByPath(projectId, target.componentPath)
    if (!currentFile) {
      edits.push({
        componentPath: target.componentPath,
        instruction: target.instruction,
        warnings: [`File not found: ${target.componentPath} — skipped`],
      })
      continue
    }

    // Save version for undo
    await saveFileVersion(projectId, target.componentPath, currentFile.content, instruction)

    // Execute the edit using existing stepSectionEdit
    try {
      const result = await stepSectionEdit(
        projectId,
        target.componentPath,
        target.instruction,
        currentFile.content,
      )
      edits.push({
        componentPath: target.componentPath,
        instruction: target.instruction,
        warnings: result.warnings,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Edit failed"
      edits.push({
        componentPath: target.componentPath,
        instruction: target.instruction,
        warnings: [`Edit failed: ${msg}`],
      })
    }
  }

  return { edits, routerDecision }
}
