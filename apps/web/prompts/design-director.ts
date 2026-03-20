/**
 * Design Director prompt builder.
 *
 * The Design Director is an Opus-powered pre-generation step that analyzes
 * a business and produces a structured DesignBrief JSON. It makes ALL
 * creative decisions — personality, colors, fonts, page structure, component
 * selection, and anti-patterns — so that Sonnet only needs to execute code.
 */

import type { BusinessProfile } from "@radiant/scraper"
import type { ComponentCatalogEntry } from "../lib/design-director"
import { getPrompt, renderPrompt } from "./store"

// ── Font blacklist ───────────────────────────────────────

const BLACKLISTED_FONTS = [
  "Inter",
  "Arial",
  "Roboto",
  "System UI",
  "sans-serif",
  "Open Sans",
  "Lato",
  "Montserrat",
]

// ── Industry reference material ──────────────────────────

const INDUSTRY_REFERENCE = getPrompt("DESIGN_DIRECTOR_INDUSTRY_REFERENCE")

// ── System prompt builder ────────────────────────────────

/**
 * Build the system prompt for the Design Director (Haiku call).
 *
 * @param availableComponents - Full catalog of animated components the
 *   director can choose from (name, library, description, tags).
 */
export function buildDesignDirectorSystemPrompt(
  availableComponents: ComponentCatalogEntry[]
): string {
  const componentList = availableComponents
    .map((c) => {
      const lines: string[] = [
        `### ${c.name} (${c.library})`,
        `Description: ${c.description}`,
      ]
      if (c.whenToUse) {
        lines.push(`When to use: ${c.whenToUse}`)
      }
      if (c.props.length > 0) {
        const propSummary = c.props
          .map((p) => `${p.name}: ${p.type}${p.default ? ` (default: ${p.default})` : ""}`)
          .join(", ")
        lines.push(`Props: ${propSummary}`)
      }
      if (c.gotchas) {
        lines.push(`Gotchas: ${c.gotchas}`)
      }
      return lines.join("\n")
    })
    .join("\n\n")

  return renderPrompt(getPrompt("DESIGN_DIRECTOR_SYSTEM_PROMPT_TEMPLATE"), {
    BLACKLISTED_FONTS: BLACKLISTED_FONTS.map((font) => `- ${font}`).join("\n"),
    INDUSTRY_REFERENCE,
    COMPONENT_LIST: componentList,
  })
}

// ── User prompt builder ──────────────────────────────────

/**
 * Build the user prompt for the Design Director, containing all available
 * business data and Firecrawl enrichment.
 */
export function buildDesignDirectorUserPrompt(
  profile: BusinessProfile
): string {
  const business = {
    name: profile.name,
    category: profile.category,
    industry: profile.industry,
    city: profile.city,
    state: profile.state,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    phone: profile.phone,
    hours: profile.hours,
    photo_count: profile.photos.length,
  }

  let brand: Record<string, unknown> | null = null
  if (profile.existingContent) {
    const ec = profile.existingContent
    brand = {
      colors: ec.colorPalette?.raw ?? [],
      logo: ec.logo?.url ?? null,
      headlines: ec.headlines,
      about: ec.about,
      socialLinks: ec.socialLinks ?? [],
      bookingLinks: ec.bookingLinks ?? [],
      orderingLinks: ec.orderingLinks ?? [],
      services: ec.services ?? [],
      teamMembers: ec.teamMembers ?? [],
      contactInfo: ec.contactInfo ?? null,
    }
  }

  const vibeClues = profile.reviews
    .filter((r) => r.rating >= 4 && r.text.length > 40)
    .slice(0, 5)
    .map((r) => `"${r.text}" — ${r.author} (${r.rating} stars)`)

  if (vibeClues.length < 3) {
    const additional = profile.reviews
      .filter((r) => r.text.length > 40)
      .slice(0, 5 - vibeClues.length)
      .map((r) => `"${r.text}" — ${r.author} (${r.rating} stars)`)
    vibeClues.push(...additional)
  }

  const input = {
    business,
    brand,
    vibe_clues: vibeClues,
    photo_count: profile.photos.length,
  }

  return renderPrompt(getPrompt("DESIGN_DIRECTOR_USER_PROMPT_TEMPLATE"), {
    INPUT_JSON: JSON.stringify(input, null, 2),
  })
}

export { BLACKLISTED_FONTS }
