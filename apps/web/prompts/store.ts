import "server-only"

import fs from "node:fs"
import path from "node:path"

const PROMPT_KEYS = [
  "BASE_SYSTEM_PROMPT",
  "DESIGN_DIRECTOR_INDUSTRY_REFERENCE",
  "DESIGN_DIRECTOR_SYSTEM_PROMPT_TEMPLATE",
  "DESIGN_DIRECTOR_USER_PROMPT_TEMPLATE",
  "BUSINESS_SCAFFOLD_USER_PROMPT_TEMPLATE",
  "BUSINESS_PAGE_USER_PROMPT_TEMPLATE",
  "CUSTOM_SCAFFOLD_USER_PROMPT_TEMPLATE",
  "CUSTOM_PAGE_USER_PROMPT_TEMPLATE",
  "PORTFOLIO_SCAFFOLD_USER_PROMPT_TEMPLATE",
  "PORTFOLIO_PAGE_USER_PROMPT_TEMPLATE",
  "SECTION_EDIT_USER_PROMPT_TEMPLATE",
  "EDIT_ROUTER_SYSTEM_PROMPT",
  "EDIT_ROUTER_USER_PROMPT_TEMPLATE",
  "FIX_PROMPT_TEMPLATE",
  "RESTAURANT_PROMPT",
  "DENTAL_PROMPT",
  "SALON_PROMPT",
  "PLUMBER_PROMPT",
  "LAWYER_PROMPT",
  "REAL_ESTATE_PROMPT",
  "GYM_PROMPT",
  "AUTO_REPAIR_PROMPT",
  "CLEANING_SERVICE_PROMPT",
  "GENERIC_PROMPT",
] as const

export type PromptKey = (typeof PROMPT_KEYS)[number]

const SECTION_PATTERN = /<<<PROMPT:([A-Z0-9_]+)>>>\n([\s\S]*?)\n<<<END_PROMPT>>>/g

let promptCache: Record<PromptKey, string> | null = null

function findPromptsEnvPath(): string {
  let currentDir = process.cwd()

  while (true) {
    const candidate = path.join(currentDir, ".prompts_env")
    if (fs.existsSync(candidate)) {
      return candidate
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  throw new Error("Missing .prompts_env. Add it at the repository root to load private prompt text.")
}

function loadPromptCache(): Record<PromptKey, string> {
  if (promptCache) return promptCache

  const filePath = findPromptsEnvPath()
  const raw = fs.readFileSync(filePath, "utf8")
  const parsed = new Map<string, string>()

  for (const match of raw.matchAll(SECTION_PATTERN)) {
    const [, key, value] = match
    parsed.set(key, value)
  }

  const missingKeys = PROMPT_KEYS.filter((key) => !parsed.has(key))
  if (missingKeys.length > 0) {
    throw new Error(
      `Missing prompt entries in .prompts_env:\n${missingKeys.map((key) => `  - ${key}`).join("\n")}`
    )
  }

  promptCache = Object.fromEntries(
    PROMPT_KEYS.map((key) => [key, parsed.get(key)!])
  ) as Record<PromptKey, string>

  return promptCache
}

export function getPrompt(key: PromptKey): string {
  return loadPromptCache()[key]
}

export function renderPrompt(
  template: string,
  variables: Record<string, string | number | boolean | undefined>
): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, variableName) => {
    if (!(variableName in variables)) {
      throw new Error(`Missing prompt variable: ${variableName}`)
    }

    return String(variables[variableName] ?? "")
  })
}
