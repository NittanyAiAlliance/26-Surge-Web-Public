/**
 * Design Director — Opus-powered creative direction.
 *
 * Analyzes a business and produces a structured DesignBrief that drives
 * all creative decisions for website generation. Runs BEFORE Sonnet to
 * separate creative direction from code generation.
 */

import { callModel } from "./ai-client"
import { MODEL_CONFIG } from "./model-config"
import fs from "node:fs"
import path from "node:path"
import type { BusinessProfile } from "@radiant/scraper"
import {
  buildDesignDirectorSystemPrompt,
  buildDesignDirectorUserPrompt,
  BLACKLISTED_FONTS,
} from "../prompts/design-director"

// ── Types ────────────────────────────────────────────────

export interface DesignBrief {
  personality: string
  mood: string
  colors: {
    source: "brand" | "inferred" | "neutral"
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  typography: {
    heading: string
    body: string
    reasoning: string
  }
  pages: {
    type: "single-page" | "multi-page"
    reasoning: string
    structure: Array<{
      path: string
      name: string
      sections: string[]
    }>
  }
  components: Array<{
    name: string
    library: string
    use_for: string
  }>
  customComponents?: Array<{
    name: string
    description: string
    use_for: string
  }>
  anti_patterns: string[]
}

export interface ComponentCatalogEntry {
  name: string
  library: string
  description: string
  whenToUse: string
  props: Array<{ name: string; type: string; default?: string; description?: string }>
  tags: string[]
  gotchas?: string
}

// ── Component catalog loader ─────────────────────────────

let cachedCatalog: ComponentCatalogEntry[] | null = null

/**
 * Load all component metadata from data/components/{library}/*.json.
 * Returns name, library, description, and tags for each component.
 * Result is cached in memory since it doesn't change at runtime.
 */
export function loadComponentCatalog(): ComponentCatalogEntry[] {
  if (cachedCatalog) return cachedCatalog

  const dataDir = path.resolve(process.cwd(), "../../data/components")
  const libraries = ["aceternity", "magic-ui", "21st-dev", "shadcn"]
  const catalog: ComponentCatalogEntry[] = []

  for (const library of libraries) {
    const libraryDir = path.join(dataDir, library)

    let files: string[]
    try {
      files = fs.readdirSync(libraryDir).filter((f) => f.endsWith(".json"))
    } catch {
      // Library directory may not exist yet in dev; skip silently
      continue
    }

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(libraryDir, file), "utf-8")
        const json = JSON.parse(raw) as {
          name?: string
          library?: string
          description?: string
          whenToUse?: string
          props?: Array<{ name: string; type: string; default?: string; description?: string }>
          tags?: string[]
          gotchas?: string
        }

        catalog.push({
          name: toKebabCase(json.name ?? file.replace(".json", "")),
          library: json.library ?? library,
          description: json.description ?? "",
          whenToUse: json.whenToUse ?? "",
          props: json.props ?? [],
          tags: json.tags ?? [],
          gotchas: json.gotchas,
        })
      } catch {
        // Malformed JSON — skip
      }
    }
  }

  cachedCatalog = catalog
  return catalog
}

/**
 * Convert a display name (e.g. "Wobble Card") to kebab-case (e.g. "wobble-card").
 */
function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
}

// ── Validation ───────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

interface ValidationError {
  field: string
  message: string
}

/**
 * Validate a parsed DesignBrief. Returns an array of errors (empty = valid).
 */
function validateDesignBrief(
  brief: DesignBrief,
  catalogNames: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = []

  // Validate color hex values
  const colorFields: Array<keyof DesignBrief["colors"]> = [
    "primary",
    "secondary",
    "accent",
    "background",
    "text",
  ]
  for (const field of colorFields) {
    const value = brief.colors?.[field]
    if (field === "source") continue
    if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) {
      errors.push({
        field: `colors.${field}`,
        message: `Invalid hex color: "${value}". Must be #XXXXXX format.`,
      })
    }
  }

  // Validate color source
  if (!["brand", "inferred", "neutral"].includes(brief.colors?.source)) {
    errors.push({
      field: "colors.source",
      message: `Invalid color source: "${brief.colors?.source}". Must be "brand", "inferred", or "neutral".`,
    })
  }

  // Validate component names exist in catalog (no minimum count — Opus decides)
  if (!Array.isArray(brief.components)) {
    errors.push({
      field: "components",
      message: "components must be an array.",
    })
  } else {
    for (const comp of brief.components) {
      if (!catalogNames.has(comp.name)) {
        errors.push({
          field: `components[${comp.name}]`,
          message: `Component "${comp.name}" not found in catalog. Available: check catalog.`,
        })
      }
    }
  }

  // Validate customComponents if present
  if (brief.customComponents !== undefined) {
    if (!Array.isArray(brief.customComponents)) {
      errors.push({
        field: "customComponents",
        message: "customComponents must be an array if provided.",
      })
    } else {
      for (const cc of brief.customComponents) {
        if (!cc.name || typeof cc.name !== "string") {
          errors.push({
            field: "customComponents",
            message: `Each custom component must have a string "name". Got: ${JSON.stringify(cc)}`,
          })
        }
        if (!cc.description || typeof cc.description !== "string") {
          errors.push({
            field: `customComponents[${cc.name}]`,
            message: `Custom component "${cc.name}" must have a string "description".`,
          })
        }
        if (!cc.use_for || typeof cc.use_for !== "string") {
          errors.push({
            field: `customComponents[${cc.name}]`,
            message: `Custom component "${cc.name}" must have a string "use_for".`,
          })
        }
      }
    }
  }

  // Validate at least 1 page in structure
  if (
    !brief.pages?.structure ||
    !Array.isArray(brief.pages.structure) ||
    brief.pages.structure.length < 1
  ) {
    errors.push({
      field: "pages.structure",
      message: "Must have at least 1 page in structure.",
    })
  }

  // Validate page type
  if (!["single-page", "multi-page"].includes(brief.pages?.type)) {
    errors.push({
      field: "pages.type",
      message: `Invalid page type: "${brief.pages?.type}". Must be "single-page" or "multi-page".`,
    })
  }

  // Validate typography fonts are not blacklisted
  const blacklistLower = BLACKLISTED_FONTS.map((f) => f.toLowerCase())
  if (brief.typography?.heading) {
    if (blacklistLower.includes(brief.typography.heading.toLowerCase())) {
      errors.push({
        field: "typography.heading",
        message: `Font "${brief.typography.heading}" is blacklisted. Choose a distinctive font.`,
      })
    }
  } else {
    errors.push({
      field: "typography.heading",
      message: "Heading font is required.",
    })
  }

  if (brief.typography?.body) {
    if (blacklistLower.includes(brief.typography.body.toLowerCase())) {
      errors.push({
        field: "typography.body",
        message: `Font "${brief.typography.body}" is blacklisted. Choose a distinctive font.`,
      })
    }
  } else {
    errors.push({
      field: "typography.body",
      message: "Body font is required.",
    })
  }

  // Validate required top-level fields
  if (!brief.personality || typeof brief.personality !== "string") {
    errors.push({
      field: "personality",
      message: "personality field is required and must be a string.",
    })
  }
  if (!brief.mood || typeof brief.mood !== "string") {
    errors.push({
      field: "mood",
      message: "mood field is required and must be a string.",
    })
  }
  if (!Array.isArray(brief.anti_patterns) || brief.anti_patterns.length < 1) {
    errors.push({
      field: "anti_patterns",
      message: "Must include at least 1 anti-pattern.",
    })
  }

  return errors
}

// ── JSON parsing helper ──────────────────────────────────

/**
 * Parse a JSON response from the model. Strips markdown fences if present.
 */
function parseJsonResponse(raw: string): unknown {
  let cleaned = raw.trim()

  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    // Remove opening fence (possibly with language tag like ```json)
    cleaned = cleaned.replace(/^```[a-z]*\n?/, "")
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```\s*$/, "")
    cleaned = cleaned.trim()
  }

  try {
    return JSON.parse(cleaned)
  } catch (e) {
    throw new Error(
      `Design Director returned invalid JSON: ${(e as Error).message}. Response preview: "${cleaned.slice(0, 200)}..."`
    )
  }
}

// ── Main function ────────────────────────────────────────

/**
 * Generate a DesignBrief for a business by calling the Opus-powered
 * Design Director.
 *
 * 1. Loads component catalog from data/components/
 * 2. Builds system + user prompts
 * 3. Calls Opus with temperature 0.7
 * 4. Parses and validates the JSON response
 * 5. Retries ONCE with error feedback if validation fails
 */
export async function generateDesignBrief(
  profile: BusinessProfile,
  customInstructions?: string
): Promise<DesignBrief> {
  const catalog = loadComponentCatalog()
  const catalogNames = new Set(catalog.map((c) => c.name))

  const systemPrompt = buildDesignDirectorSystemPrompt(catalog)
  let userPrompt = buildDesignDirectorUserPrompt(profile)

  if (customInstructions) {
    userPrompt += `\n\n## ADDITIONAL CLIENT INSTRUCTIONS\n\nThe client has provided specific requirements. Factor these into your design decisions (page structure, sections, component choices, personality):\n\n${customInstructions}`
  }

  // First attempt
  let brief = await callDesignDirector(systemPrompt, userPrompt)
  let errors = validateDesignBrief(brief, catalogNames)

  // Retry once with error feedback if validation fails
  if (errors.length > 0) {
    const errorFeedback = errors
      .map((e) => `- ${e.field}: ${e.message}`)
      .join("\n")

    const retryUserPrompt = `Your previous response had validation errors. Fix them and output corrected JSON.

ERRORS:
${errorFeedback}

PREVIOUS (INVALID) RESPONSE:
${JSON.stringify(brief, null, 2)}

Fix all errors and output ONLY valid JSON.`

    brief = await callDesignDirector(systemPrompt, retryUserPrompt)
    errors = validateDesignBrief(brief, catalogNames)

    if (errors.length > 0) {
      brief = sanitizeBrief(brief, catalogNames)
    }
  }

  return brief
}

/**
 * Make the actual API call to the Design Director model.
 */
async function callDesignDirector(
  systemPrompt: string,
  userPrompt: string
): Promise<DesignBrief> {
  const config = MODEL_CONFIG.designDirector

  const response = await callModel({
    provider: config.provider,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    systemPrompt,
    userPrompt,
    stream: false,
    cacheOptions: { staticPart: systemPrompt, dynamicPart: "" },
  })

  const parsed = parseJsonResponse(response.text)
  return parsed as DesignBrief
}

/**
 * Best-effort sanitization of a brief that failed validation.
 * Strips invalid components, fixes missing fields with safe defaults.
 */
function sanitizeBrief(
  brief: DesignBrief,
  catalogNames: Set<string>
): DesignBrief {
  // Filter out components not in catalog
  if (Array.isArray(brief.components)) {
    brief.components = brief.components.filter((c) =>
      catalogNames.has(c.name)
    )
  }

  // Ensure at least empty arrays where needed
  if (!Array.isArray(brief.anti_patterns)) {
    brief.anti_patterns = [
      "Do NOT use generic placeholder content — use real business data",
    ]
  }
  if (!Array.isArray(brief.components)) {
    brief.components = []
  }
  if (brief.customComponents && !Array.isArray(brief.customComponents)) {
    brief.customComponents = []
  }
  if (!brief.pages?.structure || !Array.isArray(brief.pages.structure)) {
    brief.pages = {
      type: "single-page",
      reasoning: "Fallback: defaulting to single-page due to validation errors",
      structure: [
        {
          path: "/",
          name: "Home",
          sections: ["hero", "about", "services", "reviews", "contact"],
        },
      ],
    }
  }

  // Fix hex colors — ensure they're valid or replace with safe fallback
  const fallbackColors: Record<string, string> = {
    primary: "#1E3A5F",
    secondary: "#475569",
    accent: "#D97706",
    background: "#FFFFFF",
    text: "#1A1A2E",
  }
  const colorKeys = ["primary", "secondary", "accent", "background", "text"] as const
  for (const key of colorKeys) {
    if (!brief.colors?.[key] || !HEX_COLOR_RE.test(brief.colors[key])) {
      if (!brief.colors) {
        brief.colors = {
          source: "neutral",
          ...fallbackColors,
        } as DesignBrief["colors"]
        break
      }
      brief.colors[key] = fallbackColors[key]
    }
  }

  // Ensure valid source
  if (!["brand", "inferred", "neutral"].includes(brief.colors?.source)) {
    brief.colors.source = "neutral"
  }

  // Ensure personality and mood
  if (!brief.personality) brief.personality = "professional-clean"
  if (!brief.mood) brief.mood = "A clean, professional website design."

  // Fix blacklisted fonts with safe alternatives
  const blacklistLower = BLACKLISTED_FONTS.map((f) => f.toLowerCase())
  if (
    !brief.typography?.heading ||
    blacklistLower.includes(brief.typography.heading.toLowerCase())
  ) {
    if (!brief.typography) {
      brief.typography = {
        heading: "DM Serif Display",
        body: "DM Sans",
        reasoning: "Fallback pairing — DM Serif Display + DM Sans is distinctive and versatile.",
      }
    } else {
      brief.typography.heading = "DM Serif Display"
    }
  }
  if (
    !brief.typography?.body ||
    blacklistLower.includes(brief.typography.body.toLowerCase())
  ) {
    brief.typography.body = "DM Sans"
  }

  return brief
}

// ── Exports for testing ──────────────────────────────────

export const DESIGN_DIRECTOR_MODEL = MODEL_CONFIG.designDirector.model
export const DESIGN_DIRECTOR_MAX_TOKENS = MODEL_CONFIG.designDirector.maxTokens
export const DESIGN_DIRECTOR_TEMPERATURE = MODEL_CONFIG.designDirector.temperature

export {
  validateDesignBrief,
  loadComponentCatalog as _loadComponentCatalog,
  parseJsonResponse as _parseJsonResponse,
  sanitizeBrief as _sanitizeBrief,
}
