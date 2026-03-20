import type { BusinessProfile } from "@radiant/scraper"

export type GenerationMode = "business" | "custom" | "portfolio"

export interface GenerationContext {
  mode: GenerationMode
  projectName: string

  // Mode: "business"
  businessProfile?: BusinessProfile

  // Mode: "custom"
  customContext?: string
  customInstructions?: string

  // Mode: "portfolio"
  resumeText?: string
  portfolioPreferences?: string
}

/**
 * Get the additional page list for a given generation mode.
 * Business: about + services/menu + contact
 * Custom: about + contact
 * Portfolio: no additional pages (single-page)
 */
export function getPagesForMode(
  context: GenerationContext
): Array<{ path: string; name: string; sections: string[] }> {
  switch (context.mode) {
    case "business": {
      const industry = (context.businessProfile?.industry ?? context.businessProfile?.category ?? "").toLowerCase()
      const isFood = industry.includes("restaurant") || industry.includes("food") || industry.includes("cafe") || industry.includes("bakery") || industry.includes("bar")
      return [
        { path: "/about", name: "About", sections: ["about", "team", "story"] },
        { path: "/services", name: isFood ? "Menu" : "Services", sections: ["services", "pricing"] },
        { path: "/contact", name: "Contact", sections: ["contact", "hours", "map"] },
      ]
    }
    case "custom":
      return [
        { path: "/about", name: "About", sections: ["about", "story"] },
        { path: "/contact", name: "Contact", sections: ["contact"] },
      ]
    case "portfolio":
      return []
  }
}

/**
 * Get the generation progress stages for a given mode.
 */
export function getStagesForMode(mode: GenerationMode) {
  const baseStages = [
    { key: "queued", label: "Starting generation...", doneAt: 0 },
    { key: "scaffold", label: "Building site structure", doneAt: 35 },
    { key: "homepage", label: "Creating homepage", doneAt: 60 },
    { key: "page_", label: "Creating additional pages", doneAt: 90 },
    { key: "complete", label: "Validating & finishing up", doneAt: 100 },
  ]

  if (mode === "business") {
    return [
      baseStages[0],
      { key: "scrape_website", label: "Scraping existing website", doneAt: 5 },
      ...baseStages.slice(1),
    ]
  }

  if (mode === "portfolio") {
    return baseStages.filter(s => s.key !== "page_")
  }

  return baseStages
}

/**
 * Get the step indicator labels for the generation flow UI.
 */
export function getStepLabelsForMode(mode: GenerationMode) {
  if (mode === "business") {
    return [
      { key: "input", label: "Search" },
      { key: "confirm", label: "Confirm" },
      { key: "generating", label: "Generate" },
      { key: "done", label: "Preview" },
    ]
  }
  return [
    { key: "input", label: "Input" },
    { key: "generating", label: "Generate" },
    { key: "done", label: "Preview" },
  ]
}
