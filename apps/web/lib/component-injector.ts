import fs from "node:fs"
import path from "node:path"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComponentSelection {
  /** Kebab-case component name, e.g. "wobble-card" */
  name: string
  /** Library folder name, e.g. "aceternity" */
  library: string
  /** Design-director description of how the component will be used */
  use_for: string
}

export interface InjectedComponent {
  /** Target path inside the generated project, e.g. "components/animated/wobble-card.tsx" */
  targetPath: string
  /** Full .tsx file content */
  content: string
  /** Short API reference snippet for the Sonnet prompt */
  apiReference: string
  /** Raw .tsx source to inline in the Sonnet prompt */
  tsxSource: string
}

export interface InjectionResult {
  /** Pre-built component files to include in the generated project */
  files: InjectedComponent[]
  /** Unique npm packages required (e.g. ["framer-motion"]) */
  dependencies: string[]
  /** Formatted prompt section with all component API references */
  promptSection: string
}

// ---------------------------------------------------------------------------
// Security constants
// ---------------------------------------------------------------------------

const KNOWN_LIBRARIES = new Set(["aceternity", "magic-ui", "21st-dev", "shadcn"])

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to `data/components/` at the repository root.
 *
 * The web app lives at `apps/web/` so we try multiple strategies to locate
 * the data directory. In Next.js dev mode `__dirname` may point into `.next/`
 * compiled output, so the walk-up from `__dirname` can fail intermittently.
 *
 * Strategies (in order):
 * 1. Walk up from __dirname (works when __dirname is apps/web/lib/)
 * 2. cwd-based (works when cwd is the monorepo root)
 * 3. Walk up from cwd (works when cwd is apps/web/ in turbo monorepo)
 * 4. Well-known monorepo paths relative to cwd (apps/web/ -> ../../data/components)
 * 5. Last resort: static relative path from __dirname
 */
export function resolveDataDir(): string {
  // Strategy 1: Walk up from this file's compiled location
  let dir = __dirname
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "data", "components")
    if (fs.existsSync(candidate)) {
      return candidate
    }
    dir = path.dirname(dir)
  }

  // Strategy 2: Direct cwd-based (cwd is monorepo root)
  const cwdCandidate = path.join(process.cwd(), "data", "components")
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate
  }

  // Strategy 3: Walk up from cwd (cwd might be apps/web/ or deeper)
  let cwdDir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(cwdDir, "data", "components")
    if (fs.existsSync(candidate)) {
      return candidate
    }
    cwdDir = path.dirname(cwdDir)
  }

  // Strategy 4: Well-known monorepo paths when cwd is apps/web/
  const monorepoFromAppsWeb = path.resolve(process.cwd(), "..", "..", "data", "components")
  if (fs.existsSync(monorepoFromAppsWeb)) {
    return monorepoFromAppsWeb
  }

  // Strategy 5: Last resort — monorepo root relative to apps/web
  const lastResort = path.resolve(__dirname, "..", "..", "..", "..", "data", "components")
  if (!fs.existsSync(lastResort)) {
    console.warn(
      `[component-injector] WARNING: Could not locate data/components/ directory. ` +
        `Tried __dirname walk-up, cwd walk-up, and well-known paths. ` +
        `__dirname=${__dirname}, cwd=${process.cwd()}, last-resort=${lastResort}`
    )
  }
  return lastResort
}

/**
 * Convert a kebab-case name to PascalCase for display in the prompt.
 * e.g. "wobble-card" -> "WobbleCard", "3d-card-effect" -> "3dCardEffect"
 */
function kebabToPascal(name: string): string {
  return name
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("")
}

/**
 * Parse a JSON component metadata file. Returns null on any error.
 */
function readComponentJson(
  jsonPath: string
): { apiReference?: string; dependencies?: string[]; name?: string } | null {
  try {
    const raw = fs.readFileSync(jsonPath, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Given a list of component selections from the design director, reads the
 * corresponding pre-built .tsx files and JSON metadata from `data/components/`,
 * and returns everything the generation pipeline needs:
 *
 * - `files` — the .tsx source mapped to `components/animated/{name}.tsx`
 * - `dependencies` — unique npm packages (e.g. framer-motion)
 * - `promptSection` — formatted API reference block for Sonnet's system prompt
 */
export function injectComponents(
  selections: ComponentSelection[]
): InjectionResult {
  const dataDir = resolveDataDir()
  const injected: InjectedComponent[] = []
  const depSet = new Set<string>()

  for (const selection of selections) {
    // ------------------------------------------------------------------
    // Validate inputs to prevent path traversal
    // ------------------------------------------------------------------
    if (!KNOWN_LIBRARIES.has(selection.library)) {
      console.warn(`[component-injector] Unknown library "${selection.library}", skipping`)
      continue
    }
    if (!SAFE_NAME_RE.test(selection.name)) {
      console.warn(`[component-injector] Invalid component name "${selection.name}", skipping`)
      continue
    }

    const libraryDir = path.join(dataDir, selection.library)
    const tsxPath = path.join(libraryDir, `${selection.name}.tsx`)
    const jsonPath = path.join(libraryDir, `${selection.name}.json`)

    // Verify resolved paths stay within the data directory
    const resolvedTsx = path.resolve(tsxPath)
    if (!resolvedTsx.startsWith(path.resolve(dataDir))) {
      console.warn(`[component-injector] Path traversal blocked: ${tsxPath}`)
      continue
    }

    // ------------------------------------------------------------------
    // Read .tsx file — skip this component if the file doesn't exist
    // ------------------------------------------------------------------
    if (!fs.existsSync(tsxPath)) {
      console.warn(
        `[component-injector] .tsx file not found for "${selection.name}" ` +
          `(${selection.library}), skipping: ${tsxPath}`
      )
      continue
    }

    let tsxContent: string
    try {
      tsxContent = fs.readFileSync(tsxPath, "utf-8")
    } catch (err) {
      console.warn(
        `[component-injector] Failed to read .tsx for "${selection.name}":`,
        err
      )
      continue
    }

    // ------------------------------------------------------------------
    // Read .json metadata (optional — we degrade gracefully)
    // ------------------------------------------------------------------
    const meta = readComponentJson(jsonPath)
    const apiReference = meta?.apiReference ?? ""
    const deps = meta?.dependencies ?? []

    for (const dep of deps) {
      depSet.add(dep)
    }

    injected.push({
      targetPath: `components/animated/${selection.name}.tsx`,
      content: tsxContent,
      apiReference,
      tsxSource: tsxContent,
    })
  }

  // ------------------------------------------------------------------
  // Build the prompt section
  // ------------------------------------------------------------------
  const promptSection = buildPromptSection(injected, selections)

  return {
    files: injected,
    dependencies: Array.from(depSet),
    promptSection,
  }
}

// ---------------------------------------------------------------------------
// Prompt section builder
// ---------------------------------------------------------------------------

function buildPromptSection(
  injected: InjectedComponent[],
  selections: ComponentSelection[]
): string {
  if (injected.length === 0) {
    return ""
  }

  const lines: string[] = [
    "## ANIMATED COMPONENTS (pre-installed, ready to import)",
    "",
  ]

  for (const component of injected) {
    const baseName = path.basename(component.targetPath, ".tsx")
    const selection = selections.find((s) => s.name === baseName)
    const useFor = selection?.use_for ?? ""
    const displayName = kebabToPascal(baseName)

    lines.push(`### ${displayName}`)
    lines.push(`Location: @/components/animated/${baseName}`)

    if (useFor) {
      lines.push(`Use for: ${useFor}`)
    }

    if (component.apiReference) {
      const refLines = component.apiReference.split("\n")
      for (const refLine of refLines) {
        const trimmed = refLine.trim()
        if (trimmed.startsWith("// Props:")) {
          lines.push(trimmed.replace("// ", ""))
        }
      }

      const usageLine = refLines.find((l) => l.trim().startsWith("<"))
      if (usageLine) {
        lines.push(`Usage: ${usageLine.trim()}`)
      }
    }

    if (component.tsxSource) {
      lines.push("")
      lines.push("Source code (READ-ONLY — this component is pre-built, do NOT regenerate it):")
      lines.push("```tsx")
      lines.push(component.tsxSource)
      lines.push("```")
    }

    lines.push("")
  }

  return lines.join("\n")
}
