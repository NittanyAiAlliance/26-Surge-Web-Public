import type { BusinessProfile } from "@radiant/scraper"
import { renderPrompt, getPrompt } from "../prompts/store"
import type { GenerationContext } from "./types/generation"
import { getBaseSystemPrompt, getSystemPromptParts } from "../prompts/system"

// ── Types ────────────────────────────────────────────────

export interface GenerationPrompt {
  system: string
  /** Static portion of the system prompt (cacheable across generations) */
  systemStatic?: string
  /** Dynamic portion of the system prompt (changes per generation) */
  systemDynamic?: string
  user: string
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Sanitize a string value before embedding in a prompt.
 * Strips markdown heading markers and horizontal rules that could be
 * interpreted as prompt structure, while preserving the actual content.
 */
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")        // Strip markdown headings (## HEADING -> HEADING)
    .replace(/^---+$/gm, "")             // Strip horizontal rules
    .replace(/^===+$/gm, "")             // Strip alternate heading underlines
    .trim()
}

/** Truncate text to a max length, adding ellipsis if needed */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + "..."
}

/** Sanitize business data for prompt inclusion — truncate long fields */
function sanitizeProfileForPrompt(profile: BusinessProfile): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: sanitizeForPrompt(truncateText(profile.name, 200)),
    address: sanitizeForPrompt(truncateText(profile.address, 300)),
    city: sanitizeForPrompt(profile.city),
    state: sanitizeForPrompt(profile.state),
    phone: profile.phone,
    industry: sanitizeForPrompt(profile.industry),
    category: sanitizeForPrompt(profile.category),
    rating: profile.rating,
    reviewCount: profile.reviewCount,
  }

  if (profile.website) data.website = profile.website
  if (profile.hours.length > 0) data.hours = profile.hours
  if (profile.photos.length > 0) data.photos = profile.photos.slice(0, 10)

  if (profile.reviews.length > 0) {
    data.reviews = profile.reviews.slice(0, 10).map(r => ({
      ...r,
      text: sanitizeForPrompt(truncateText(r.text, 500)),
      author: sanitizeForPrompt(truncateText(r.author, 100)),
    }))
  }

  if (profile.location) data.location = profile.location

  if (profile.existingContent) {
    const ec = profile.existingContent
    const existing: Record<string, unknown> = {}
    if ((ec.headlines?.length ?? 0) > 0) existing.headlines = ec.headlines!.slice(0, 10).map(h => sanitizeForPrompt(truncateText(h, 300)))
    if ((ec.descriptions?.length ?? 0) > 0) existing.descriptions = ec.descriptions!.slice(0, 5).map(d => sanitizeForPrompt(truncateText(d, 500)))
    if (ec.about) existing.about = sanitizeForPrompt(truncateText(ec.about, 1000))
    if ((ec.socialLinks?.length ?? 0) > 0) existing.socialLinks = ec.socialLinks
    if ((ec.bookingLinks?.length ?? 0) > 0) existing.bookingLinks = ec.bookingLinks
    if ((ec.orderingLinks?.length ?? 0) > 0) existing.orderingLinks = ec.orderingLinks
    if ((ec.importantLinks?.length ?? 0) > 0) existing.importantLinks = ec.importantLinks
    if (ec.logo) existing.logo = ec.logo
    if (ec.colorPalette && ec.colorPalette.raw.length > 0) existing.colorPalette = ec.colorPalette
    if ((ec.teamMembers?.length ?? 0) > 0) existing.teamMembers = ec.teamMembers!.slice(0, 20).map(t => ({
      ...t,
      name: sanitizeForPrompt(t.name),
      role: t.role ? sanitizeForPrompt(t.role) : t.role,
    }))
    if (ec.contactInfo) existing.contactInfo = ec.contactInfo
    if ((ec.services?.length ?? 0) > 0) existing.services = ec.services!.slice(0, 30).map(s => ({
      ...s,
      name: sanitizeForPrompt(s.name),
      description: s.description ? sanitizeForPrompt(s.description) : s.description,
    }))
    if (Object.keys(existing).length > 0) data.existingContent = existing
  }

  return data
}

/**
 * Format the core business data as JSON for inclusion in user prompts.
 * Uses sanitizeProfileForPrompt to truncate long fields and limit array sizes.
 */
function formatBusinessData(profile: BusinessProfile): string {
  return JSON.stringify(sanitizeProfileForPrompt(profile), null, 2)
}

/**
 * Format existing-content fields (social links, logo, booking, brand colors,
 * team, contact) into a dedicated section so the model notices them.
 */
function formatExistingContent(profile: BusinessProfile): string {
  const ec = profile.existingContent
  if (!ec) return ""

  const parts: string[] = []

  if (ec.logo) {
    parts.push(`Logo URL: ${ec.logo.url}${ec.logo.alt ? ` (alt: ${sanitizeForPrompt(truncateText(ec.logo.alt, 200))})` : ""}`)
  }

  if (ec.colorPalette && ec.colorPalette.raw.length > 0) {
    parts.push(`Brand colors: ${JSON.stringify(ec.colorPalette)}`)
  }

  if (ec.socialLinks && ec.socialLinks.length > 0) {
    parts.push(`Social links:\n${ec.socialLinks.map((l) => `  - ${sanitizeForPrompt(truncateText(l.platform, 100))}: ${l.url}`).join("\n")}`)
  }

  if (ec.bookingLinks && ec.bookingLinks.length > 0) {
    parts.push(`Booking links:\n${ec.bookingLinks.map((l) => `  - ${sanitizeForPrompt(truncateText(l.label, 200))}: ${l.url}`).join("\n")}`)
  }

  if (ec.orderingLinks && ec.orderingLinks.length > 0) {
    parts.push(`Ordering links:\n${ec.orderingLinks.map((l) => `  - ${sanitizeForPrompt(truncateText(l.label, 200))}: ${l.url}`).join("\n")}`)
  }

  if (ec.importantLinks && ec.importantLinks.length > 0) {
    parts.push(`Important CTA links:\n${ec.importantLinks.map((l) => `  - ${sanitizeForPrompt(truncateText(l.label, 200))}: ${l.url}`).join("\n")}`)
  }

  if (ec.contactInfo) {
    const ci = ec.contactInfo
    const contactParts: string[] = []
    if (ci.email) contactParts.push(`Email: ${truncateText(ci.email, 200)}`)
    if (ci.phone) contactParts.push(`Phone: ${truncateText(ci.phone, 50)}`)
    if (ci.address) contactParts.push(`Address: ${sanitizeForPrompt(truncateText(ci.address, 300))}`)
    if (ci.mapEmbedUrl) contactParts.push(`Map embed: ${ci.mapEmbedUrl}`)
    if (contactParts.length > 0) parts.push(`Contact info:\n${contactParts.map((p) => `  - ${p}`).join("\n")}`)
  }

  if (ec.services && ec.services.length > 0) {
    parts.push(`Services:\n${ec.services.slice(0, 30).map((s) => `  - ${sanitizeForPrompt(truncateText(s.name, 200))}${s.description ? `: ${sanitizeForPrompt(truncateText(s.description, 300))}` : ""}${s.price ? ` ($${s.price})` : ""}`).join("\n")}`)
  }

  if (ec.teamMembers && ec.teamMembers.length > 0) {
    parts.push(`Team members:\n${ec.teamMembers.slice(0, 20).map((t) => `  - ${sanitizeForPrompt(truncateText(t.name, 100))}${t.role ? ` (${sanitizeForPrompt(truncateText(t.role, 100))})` : ""}${t.photoUrl ? ` — photo: ${t.photoUrl}` : ""}`).join("\n")}`)
  }

  if (parts.length === 0) return ""

  return `\n## EXISTING BUSINESS CONTENT\n\nThe business already has these assets — use them:\n\n${parts.join("\n\n")}`
}

/**
 * Format scaffold files as read-only context for page generation prompts.
 */
function formatScaffoldContext(scaffoldFiles: Array<{ path: string; content: string }>): string {
  return scaffoldFiles
    .map((f) => `--- FILE: ${f.path} (READ-ONLY) ---\n${f.content}\n--- END FILE ---`)
    .join("\n\n")
}

// ── Page List ────────────────────────────────────────────

/**
 * Build the list of pages that will exist on the generated site.
 * This is used to tell the model exactly which internal routes are valid,
 * preventing it from creating links to non-existent pages like /shop.
 */
function buildPageList(profile: BusinessProfile): Array<{ name: string; path: string }> {
  const pages = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
  ]

  // Services page — label varies by industry
  const industry = (profile.industry || profile.category || "").toLowerCase()
  if (industry.includes("restaurant") || industry.includes("food") || industry.includes("cafe") || industry.includes("bakery") || industry.includes("bar")) {
    pages.push({ name: "Menu", path: "/services" })
  } else {
    pages.push({ name: "Services", path: "/services" })
  }

  pages.push({ name: "Contact", path: "/contact" })

  return pages
}

// ── Scaffold Prompt ──────────────────────────────────────

/**
 * Build system + user prompts for the scaffold generation step.
 *
 * The scaffold step produces the shared shell: layout, nav, footer,
 * Tailwind config, and global CSS. No page content is generated here.
 * The model decides fonts, colors, and page structure based on the business data.
 */
export function buildScaffoldPrompt(
  profile: BusinessProfile,
  customInstructions?: string
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  // Build the page list to tell the model exactly which routes will exist
  const pageList = buildPageList(profile)
  const pageListFormatted = pageList
    .map((p) => `  - "${p.name}" → \`${p.path}\``)
    .join("\n")

  const user = renderPrompt(getPrompt("BUSINESS_SCAFFOLD_USER_PROMPT_TEMPLATE"), {
    PAGE_LIST: pageListFormatted,
    BUSINESS_DATA_JSON: formatBusinessData(profile),
    EXISTING_CONTENT: formatExistingContent(profile),
  })

  const safeInstructions = customInstructions ? sanitizeForPrompt(truncateText(customInstructions, 5_000)) : undefined
  const finalUser = safeInstructions
    ? user + `\n\n## ADDITIONAL CLIENT INSTRUCTIONS\n\nThe client has provided specific requirements for their website:\n\n${safeInstructions}\n\nIncorporate these instructions naturally into the site design and content.`
    : user

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user: finalUser }
}

// ── Page Prompt ──────────────────────────────────────────

/**
 * Build system + user prompts for generating a single page.
 *
 * The scaffold files are provided as read-only context so the model
 * understands the layout, nav, footer, colors, and fonts already in place.
 */
export function buildPagePrompt(
  profile: BusinessProfile,
  scaffoldFiles: Array<{ path: string; content: string }>,
  page: { path: string; name: string; sections: string[] },
  customInstructions?: string
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  const pagePath = page.path === "/" ? "app/page.tsx" : `app${page.path}/page.tsx`

  const sectionList = page.sections
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n")

  // Build relevant data snippets based on sections
  const relevantData = buildRelevantData(profile, page.sections)

  // Build the page list so the model knows which routes exist
  const pageList = buildPageList(profile)
  const pageListFormatted = pageList
    .map((p) => `  - "${p.name}" → \`${p.path}\``)
    .join("\n")

  const user = renderPrompt(getPrompt("BUSINESS_PAGE_USER_PROMPT_TEMPLATE"), {
    PAGE_NAME: page.name,
    PAGE_LIST: pageListFormatted,
    SCAFFOLD_CONTEXT: formatScaffoldContext(scaffoldFiles),
    PAGE_PATH: pagePath,
    SECTION_LIST: sectionList,
    BUSINESS_DATA_JSON: formatBusinessData(profile),
    EXISTING_CONTENT: formatExistingContent(profile),
    RELEVANT_DATA: relevantData,
  })

  const safeInstructions = customInstructions ? sanitizeForPrompt(truncateText(customInstructions, 5_000)) : undefined
  const finalUser = safeInstructions
    ? user + `\n\n## ADDITIONAL CLIENT INSTRUCTIONS\n\nThe client has provided specific requirements for their website:\n\n${safeInstructions}\n\nIncorporate these instructions naturally into the page content and sections.`
    : user

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user: finalUser }
}

// ── Custom Scaffold Prompt ───────────────────────────────

/**
 * Build system + user prompts for scaffold generation from freeform context.
 *
 * Similar to buildScaffoldPrompt but takes raw context text instead of a
 * BusinessProfile. The model chooses fonts, colors, and design based on the
 * provided context.
 */
export function buildCustomScaffoldPrompt(
  name: string,
  context: string,
  customInstructions?: string
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  const pageList = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Contact", path: "/contact" },
  ]
  const pageListFormatted = pageList
    .map((p) => `  - "${p.name}" → \`${p.path}\``)
    .join("\n")

  const safeName = sanitizeForPrompt(truncateText(name, 200))
  const safeContext = sanitizeForPrompt(truncateText(context, 50_000))

  const user = renderPrompt(getPrompt("CUSTOM_SCAFFOLD_USER_PROMPT_TEMPLATE"), {
    SITE_NAME: safeName,
    SITE_CONTEXT: safeContext,
    PAGE_LIST: pageListFormatted,
  })

  const safeInstructions = customInstructions ? sanitizeForPrompt(truncateText(customInstructions, 5_000)) : undefined
  const finalUser = safeInstructions
    ? user + `\n\n## ADDITIONAL CLIENT INSTRUCTIONS\n\nThe client has provided specific requirements for their website:\n\n${safeInstructions}\n\nIncorporate these instructions naturally into the site design and content.`
    : user

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user: finalUser }
}

// ── Custom Page Prompt ───────────────────────────────────

/**
 * Build system + user prompts for generating a single page from freeform context.
 *
 * Similar to buildPagePrompt but uses raw context text instead of a BusinessProfile.
 */
export function buildCustomPagePrompt(
  name: string,
  context: string,
  scaffoldFiles: Array<{ path: string; content: string }>,
  page: { path: string; name: string; sections: string[] },
  customInstructions?: string
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  const pagePath = page.path === "/" ? "app/page.tsx" : `app${page.path}/page.tsx`

  const sectionList = page.sections
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n")

  const pageList = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Contact", path: "/contact" },
  ]
  const pageListFormatted = pageList
    .map((p) => `  - "${p.name}" → \`${p.path}\``)
    .join("\n")

  const safeName = sanitizeForPrompt(truncateText(name, 200))
  const safeContext = sanitizeForPrompt(truncateText(context, 50_000))

  const user = renderPrompt(getPrompt("CUSTOM_PAGE_USER_PROMPT_TEMPLATE"), {
    PAGE_NAME: page.name,
    SITE_NAME: safeName,
    PAGE_LIST: pageListFormatted,
    SCAFFOLD_CONTEXT: formatScaffoldContext(scaffoldFiles),
    PAGE_PATH: pagePath,
    SECTION_LIST: sectionList,
    SITE_CONTEXT: safeContext,
  })

  const safeInstructions = customInstructions ? sanitizeForPrompt(truncateText(customInstructions, 5_000)) : undefined
  const finalUser = safeInstructions
    ? user + `\n\n## ADDITIONAL CLIENT INSTRUCTIONS\n\nThe client has provided specific requirements for their website:\n\n${safeInstructions}\n\nIncorporate these instructions naturally into the page content and sections.`
    : user

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user: finalUser }
}

// ── Portfolio Scaffold Prompt ────────────────────────────

/**
 * Build system + user prompts for scaffold generation from a resume.
 *
 * Generates a personal portfolio/developer website. The model extracts the
 * person's name from the resume for the site title.
 */
export function buildPortfolioScaffoldPrompt(
  resumeText: string,
  preferences?: string
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  const pageListFormatted = `  - "Home" → \`/\``

  const safeResume = sanitizeForPrompt(truncateText(resumeText, 50_000))

  const user = renderPrompt(getPrompt("PORTFOLIO_SCAFFOLD_USER_PROMPT_TEMPLATE"), {
    RESUME_TEXT: safeResume,
    PAGE_LIST: pageListFormatted,
  })

  const safePreferences = preferences ? sanitizeForPrompt(truncateText(preferences, 5_000)) : undefined
  const finalUser = safePreferences
    ? user + `\n\n## PORTFOLIO PREFERENCES\n\nThe user has provided specific preferences for their portfolio:\n\n${safePreferences}\n\nIncorporate these preferences naturally into the site design.`
    : user

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user: finalUser }
}

// ── Portfolio Page Prompt ────────────────────────────────

/**
 * Build system + user prompts for generating the portfolio homepage.
 *
 * The homepage is a single-page portfolio with sections for hero, about,
 * experience, skills, projects, education, and contact.
 */
export function buildPortfolioPagePrompt(
  resumeText: string,
  preferences: string | undefined,
  scaffoldFiles: Array<{ path: string; content: string }>,
  page: { path: string; name: string; sections: string[] }
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  const pagePath = page.path === "/" ? "app/page.tsx" : `app${page.path}/page.tsx`

  const sectionList = page.sections
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n")

  const user = renderPrompt(getPrompt("PORTFOLIO_PAGE_USER_PROMPT_TEMPLATE"), {
    PAGE_NAME: page.name,
    SCAFFOLD_CONTEXT: formatScaffoldContext(scaffoldFiles),
    PAGE_PATH: pagePath,
    SECTION_LIST: sectionList,
    RESUME_TEXT: sanitizeForPrompt(truncateText(resumeText, 50_000)),
  })

  const safePreferences = preferences ? sanitizeForPrompt(truncateText(preferences, 5_000)) : undefined
  const finalUser = safePreferences
    ? user + `\n\n## PORTFOLIO PREFERENCES\n\nThe user has provided specific preferences for their portfolio:\n\n${safePreferences}\n\nIncorporate these preferences naturally into the page content and sections.`
    : user

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user: finalUser }
}

// ── Mode Routing ─────────────────────────────────────────

/**
 * Route to the correct scaffold prompt builder based on the generation mode.
 */
export function buildScaffoldPromptForMode(context: GenerationContext): GenerationPrompt {
  switch (context.mode) {
    case "business":
      return buildScaffoldPrompt(context.businessProfile!, context.customInstructions)
    case "custom":
      return buildCustomScaffoldPrompt(context.projectName, context.customContext!, context.customInstructions)
    case "portfolio":
      return buildPortfolioScaffoldPrompt(context.resumeText!, context.portfolioPreferences)
  }
}

/**
 * Route to the correct page prompt builder based on the generation mode.
 */
export function buildPagePromptForMode(
  context: GenerationContext,
  scaffoldFiles: Array<{ path: string; content: string }>,
  page: { path: string; name: string; sections: string[] }
): GenerationPrompt {
  switch (context.mode) {
    case "business":
      return buildPagePrompt(context.businessProfile!, scaffoldFiles, page, context.customInstructions)
    case "custom":
      return buildCustomPagePrompt(context.projectName, context.customContext!, scaffoldFiles, page, context.customInstructions)
    case "portfolio":
      return buildPortfolioPagePrompt(context.resumeText!, context.portfolioPreferences, scaffoldFiles, page)
  }
}

// ── Section Edit Prompt ──────────────────────────────────

/**
 * Build system + user prompts for editing a single section component.
 *
 * Uses the same cached system prompt. Only the user message changes per edit.
 * Includes scaffold context (tailwind config, globals.css) for style consistency
 * and condensed business data to prevent AI from hallucinating factual info.
 */
export function buildSectionEditPrompt(
  currentContent: string,
  componentPath: string,
  instruction: string,
  scaffoldContext: { tailwindConfig: string; layoutFile: string; globalsCss: string },
  businessData?: {
    name?: string;
    address?: string;
    phone?: string;
    hours?: unknown;
    category?: string;
    rating?: number;
    reviewCount?: number;
  },
): GenerationPrompt {
  const system = getBaseSystemPrompt()
  const { staticPart, dynamicPart } = getSystemPromptParts()

  const safeInstruction = sanitizeForPrompt(truncateText(instruction, 2000))

  let businessContext = ""
  if (businessData) {
    const parts: string[] = []
    if (businessData.name) parts.push(`Name: ${sanitizeForPrompt(businessData.name)}`)
    if (businessData.address) parts.push(`Address: ${sanitizeForPrompt(businessData.address)}`)
    if (businessData.phone) parts.push(`Phone: ${businessData.phone}`)
    if (businessData.category) parts.push(`Category: ${sanitizeForPrompt(businessData.category)}`)
    if (businessData.rating != null) parts.push(`Rating: ${businessData.rating}${businessData.reviewCount ? ` (${businessData.reviewCount} reviews)` : ""}`)
    if (businessData.hours) parts.push(`Hours: ${JSON.stringify(businessData.hours)}`)
    if (parts.length > 0) {
      businessContext = `\n\n## BUSINESS CONTEXT (factual reference — use for any data-related edits)\n${parts.join("\n")}`
    }
  }

  // Detect if this is a scaffold file edit (theme, styles, nav, footer, layout)
  const isScaffoldFile = ["tailwind.config.ts", "app/globals.css", "app/layout.tsx"].includes(componentPath)
    || componentPath === "components/Nav.tsx"
    || componentPath === "components/Footer.tsx"

  // For scaffold files, don't include themselves as read-only context (they're the target)
  // Instead, show the OTHER scaffold file for cross-reference
  let designContext = ""
  if (isScaffoldFile) {
    if (componentPath === "tailwind.config.ts" && scaffoldContext.globalsCss) {
      designContext = `\n## RELATED FILE (READ-ONLY — shows how CSS variables are defined)\n--- FILE: app/globals.css ---\n${scaffoldContext.globalsCss}\n--- END FILE ---`
    } else if (componentPath === "app/globals.css" && scaffoldContext.tailwindConfig) {
      designContext = `\n## RELATED FILE (READ-ONLY — shows how CSS variables are consumed)\n--- FILE: tailwind.config.ts ---\n${scaffoldContext.tailwindConfig}\n--- END FILE ---`
    } else {
      designContext = `\n## DESIGN CONTEXT (READ-ONLY)\n--- FILE: tailwind.config.ts ---\n${scaffoldContext.tailwindConfig}\n--- END FILE ---\n\n--- FILE: app/globals.css ---\n${scaffoldContext.globalsCss}\n--- END FILE ---`
    }
  } else {
    designContext = `\n## DESIGN CONTEXT (READ-ONLY — do not regenerate these)\n--- FILE: tailwind.config.ts ---\n${scaffoldContext.tailwindConfig}\n--- END FILE ---\n\n--- FILE: app/globals.css ---\n${scaffoldContext.globalsCss}\n--- END FILE ---`
  }

  // Build scaffold-specific rules
  const scaffoldRules = isScaffoldFile ? `
- CRITICAL: Preserve the CSS variable FORMAT exactly. If variables use space-separated values (e.g., "254 253 251"), keep that format. If they use HSL (e.g., "0 0% 100%"), keep HSL. NEVER change the format — only change the values.
- If editing tailwind.config.ts: the colors reference CSS variables via hsl(var(--name)) or rgb(var(--name)). Do NOT change these wrapper functions. Only modify the globals.css if you need different color values.
- If editing globals.css: keep the EXACT same variable names and format. Only change the numeric values.
- Preserve all existing CSS variable names — components depend on them.
- Keep the file structure (imports, exports, module format) identical.` : ""

  const user = renderPrompt(getPrompt("SECTION_EDIT_USER_PROMPT_TEMPLATE"), {
    COMPONENT_PATH: componentPath,
    INSTRUCTION: safeInstruction,
    CURRENT_CONTENT: currentContent,
    DESIGN_CONTEXT: designContext,
    BUSINESS_CONTEXT: businessContext,
    SCAFFOLD_RULES: scaffoldRules,
  })

  return { system, systemStatic: staticPart, systemDynamic: dynamicPart, user }
}

// ── Edit Router Prompt ───────────────────────────────────

/**
 * Build a prompt for the edit router — determines which file(s) to edit
 * based on the user's instruction and the project structure.
 *
 * Uses ONLY metadata (section names + paths) — no file contents.
 * This keeps the input tiny (~300 tokens) for fast, cheap routing.
 */
export function buildEditRouterPrompt(
  instruction: string,
  projectStructure: Array<{ pagePath: string; sectionName: string; componentPath: string }>,
): { system: string; user: string } {
  const safeInstruction = sanitizeForPrompt(truncateText(instruction, 2000))

  const structureTable = projectStructure
    .map((s) => `| ${s.sectionName} | ${s.componentPath} | ${s.pagePath === "/_global" ? "Global" : s.pagePath} |`)
    .join("\n")

  const system = getPrompt("EDIT_ROUTER_SYSTEM_PROMPT")
  const user = renderPrompt(getPrompt("EDIT_ROUTER_USER_PROMPT_TEMPLATE"), {
    INSTRUCTION: safeInstruction,
    STRUCTURE_TABLE: structureTable,
  })

  return { system, user }
}

// ── Relevant data builder ────────────────────────────────

/**
 * Build section-specific data hints so the model has the most relevant
 * business data front-and-center for each section type.
 */
function buildRelevantData(
  profile: BusinessProfile,
  sections: string[]
): string {
  const parts: string[] = []
  const sectionSet = new Set(sections.map((s) => s.toLowerCase()))

  if (sectionSet.has("reviews") || sectionSet.has("testimonials")) {
    if (profile.reviews.length > 0) {
      const truncatedReviews = profile.reviews.slice(0, 8).map(r => ({
        ...r,
        text: sanitizeForPrompt(truncateText(r.text, 500)),
        author: sanitizeForPrompt(truncateText(r.author, 100)),
      }))
      parts.push(`### Reviews (for testimonials section)\n\`\`\`json\n${JSON.stringify(truncatedReviews, null, 2)}\n\`\`\``)
    }
  }

  if (sectionSet.has("gallery") || sectionSet.has("photos")) {
    if (profile.photos.length > 0) {
      parts.push(`### Photos (for gallery section)\n\`\`\`json\n${JSON.stringify(profile.photos.slice(0, 10), null, 2)}\n\`\`\``)
    }
  }

  if (sectionSet.has("hours") || sectionSet.has("contact")) {
    if (profile.hours.length > 0) {
      parts.push(`### Business Hours (for contact/hours section)\n\`\`\`json\n${JSON.stringify(profile.hours, null, 2)}\n\`\`\``)
    }
  }

  if (sectionSet.has("team") || sectionSet.has("staff") || sectionSet.has("about")) {
    if (profile.existingContent?.teamMembers && profile.existingContent.teamMembers.length > 0) {
      const truncatedTeam = profile.existingContent.teamMembers.slice(0, 20).map(t => ({
        ...t,
        name: sanitizeForPrompt(truncateText(t.name, 100)),
        role: t.role ? sanitizeForPrompt(truncateText(t.role, 100)) : undefined,
      }))
      parts.push(`### Team Members\n\`\`\`json\n${JSON.stringify(truncatedTeam, null, 2)}\n\`\`\``)
    }
  }

  if (sectionSet.has("services") || sectionSet.has("menu")) {
    if (profile.existingContent?.services && profile.existingContent.services.length > 0) {
      const truncatedServices = profile.existingContent.services.slice(0, 30).map(s => ({
        ...s,
        name: sanitizeForPrompt(truncateText(s.name, 200)),
        description: s.description ? sanitizeForPrompt(truncateText(s.description, 300)) : undefined,
      }))
      parts.push(`### Services/Menu Items\n\`\`\`json\n${JSON.stringify(truncatedServices, null, 2)}\n\`\`\``)
    }
  }

  if (parts.length === 0) return ""

  return `\n## SECTION-SPECIFIC DATA\n\n${parts.join("\n\n")}`
}
