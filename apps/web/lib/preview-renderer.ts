/**
 * Preview renderer: assembles generated project files into a
 * self-contained HTML page for iframe preview.
 *
 * Strategy:
 * - React + ReactDOM via CDN for component rendering
 * - Babel standalone for in-browser TSX transpilation
 * - Tailwind Play CDN for utility-class styling
 * - Shims for Next.js (Image, Link), shadcn/ui, Lucide icons, and framer-motion
 * - All component code inlined in a single <script> block
 */

interface PreviewFile {
  file_path: string
  content: string
  file_type: string | null
}

/**
 * Render a complete, self-contained HTML preview from project files.
 */
export function renderPreview(
  files: PreviewFile[],
  businessName: string
): string {
  const tailwindConfigFile = files.find(
    (f) => f.file_path === "tailwind.config.ts"
  )
  const tailwindConfig = tailwindConfigFile
    ? extractTailwindTheme(tailwindConfigFile.content)
    : "{}"

  const layoutFile = files.find((f) => f.file_path === "app/layout.tsx")
  const fonts = layoutFile ? extractGoogleFonts(layoutFile.content) : []
  const fontVariables = layoutFile ? extractFontVariables(layoutFile.content) : []
  const bodyClasses = layoutFile
    ? extractBodyClasses(layoutFile.content)
    : "antialiased"

  const cssContent = files
    .filter((f) => f.file_path.endsWith(".css"))
    .map((f) => stripTailwindDirectives(f.content))
    .join("\n")

  const { code: componentCode, names: componentNames } =
    buildComponentBundle(files)

  return assembleHTML({
    title: businessName,
    fonts,
    fontVariables,
    bodyClasses,
    tailwindConfig,
    cssContent,
    componentCode,
    componentNames,
  })
}

// ── Tailwind Config Extraction ──────────────────────────

// shadcn/ui color mappings needed for utilities like border-border, bg-background, etc.
const SHADCN_COLORS = `
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },`

const DEFAULT_SHADCN_CONFIG = `{ theme: { extend: { colors: {${SHADCN_COLORS}
      }, borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" } } } }`

function extractTailwindTheme(content: string): string {
  const themeIdx = content.indexOf("theme:")
  if (themeIdx === -1) return DEFAULT_SHADCN_CONFIG

  const startIdx = content.indexOf("{", themeIdx)
  if (startIdx === -1) return DEFAULT_SHADCN_CONFIG

  // Brace-counting to find the matching closing brace
  let depth = 0
  let endIdx = startIdx
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === "{") depth++
    else if (content[i] === "}") {
      depth--
      if (depth === 0) {
        endIdx = i
        break
      }
    }
  }

  let themeBody = content.slice(startIdx, endIdx + 1)

  // Inject shadcn color mappings if missing
  if (!themeBody.includes('"hsl(var(--border))"') && !themeBody.includes("'hsl(var(--border))'")) {
    // Find the colors: { block and inject
    const colorsIdx = themeBody.indexOf("colors:")
    if (colorsIdx !== -1) {
      const colorsStart = themeBody.indexOf("{", colorsIdx)
      if (colorsStart !== -1) {
        themeBody = themeBody.slice(0, colorsStart + 1) + SHADCN_COLORS + themeBody.slice(colorsStart + 1)
      }
    }
  }

  return `{ theme: ${themeBody} }`
}

// ── Font Extraction ─────────────────────────────────────

function extractGoogleFonts(content: string): string[] {
  const importLine = content
    .split("\n")
    .find((line) => line.includes("next/font/google"))
  if (!importLine) return []

  const namesMatch = importLine.match(/import\s*\{([^}]+)\}/)
  if (!namesMatch) return []

  return namesMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => name.replace(/_/g, "+"))
}

/**
 * Extract CSS variable → font family mappings from layout.tsx.
 * Parses patterns like: `const oswald = Oswald({ variable: "--font-oswald" })`
 * and maps "--font-oswald" → "Oswald".
 */
function extractFontVariables(content: string): Array<{ variable: string; family: string }> {
  const results: Array<{ variable: string; family: string }> = []

  // Match font constructor calls: FontName({ ... variable: "--font-xxx" ... })
  const pattern = /(\w+)\s*\(\s*\{[^}]*variable:\s*["']([^"']+)["'][^}]*\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const fontConstructor = match[1] // e.g. "Oswald", "Open_Sans"
    const variable = match[2]        // e.g. "--font-oswald"
    // Convert constructor name to font family: Open_Sans → Open Sans
    const family = fontConstructor.replace(/_/g, " ")
    results.push({ variable, family })
  }

  return results
}

function extractBodyClasses(content: string): string {
  // Match static className on <body>
  const bodyMatch = content.match(
    /<body[^>]*className\s*=\s*["']([^"']+)["']/
  )
  if (bodyMatch) return bodyMatch[1]

  // Match template literal: className={`${font.className} antialiased`}
  const templateMatch = content.match(
    /<body[^>]*className\s*=\s*\{`[^`]*?`\}/
  )
  if (templateMatch) {
    // Extract static parts (not ${expressions})
    const staticParts = templateMatch[0]
      .replace(/\$\{[^}]+\}/g, "")
      .match(/`([^`]*)`/)
    if (staticParts) return staticParts[1].trim()
  }

  return "antialiased"
}

// ── CSS Processing ──────────────────────────────────────

/**
 * Process CSS for preview rendering.
 * The Tailwind Play CDN supports @apply and @layer in <style type="text/tailwindcss">.
 * We only need to strip directives that the CDN doesn't understand.
 */
function stripTailwindDirectives(css: string): string {
  let result = css
    // Remove @tailwind directives (CDN injects base/components/utilities automatically)
    .replace(/@tailwind\s+\w+\s*;/g, "")
    // Remove @import statements (not supported in CDN context)
    .replace(/@import\s+["'][^"']*["']\s*;/g, "")
    // Remove @custom-variant directives (Tailwind v4 only, CDN is v3)
    .replace(/@custom-variant\s+[^;{]+;/g, "")
    // Remove @plugin directives (Tailwind v4 only)
    .replace(/@plugin\s+["'][^"']*["']\s*;/g, "")

  // Remove @theme blocks (Tailwind v4 directive, CDN is v3)
  result = removeAtThemeBlocks(result)

  // KEEP @layer blocks intact — the CDN processes them in <style type="text/tailwindcss">
  // KEEP @apply directives — the CDN processes them in <style type="text/tailwindcss">

  return result.trim()
}

/**
 * Remove @theme blocks using brace counting (Tailwind v4 directive).
 */
function removeAtThemeBlocks(css: string): string {
  let result = css
  const pattern = /@theme[\s\w]*\{/

  let match: RegExpExecArray | null
  while ((match = pattern.exec(result)) !== null) {
    const start = match.index
    const braceStart = result.indexOf("{", start)

    let depth = 0
    let end = braceStart
    for (let i = braceStart; i < result.length; i++) {
      if (result[i] === "{") depth++
      else if (result[i] === "}") {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    result = result.slice(0, start) + result.slice(end + 1)
  }

  return result
}

// ── Component Bundling ──────────────────────────────────

function buildComponentBundle(
  files: PreviewFile[]
): { code: string; names: Set<string> } {
  const chunks: string[] = []
  const names = new Set<string>()

  // Process component files first (they must be defined before page.tsx)
  const componentFiles = files
    .filter(
      (f) =>
        f.file_path.startsWith("components/") &&
        !f.file_path.startsWith("components/ui/") &&
        (f.file_path.endsWith(".tsx") || f.file_path.endsWith(".ts"))
    )
    .sort((a, b) => a.file_path.localeCompare(b.file_path))

  for (const file of componentFiles) {
    const rawName = file.file_path.replace(/\.tsx?$/, "").split("/").pop()!
    const componentName = toPascalCase(rawName)
    names.add(componentName)
    const processed = processComponentFile(file.file_path, file.content)
    if (processed) chunks.push(processed)
  }

  // Process page.tsx last
  const pageFile = files.find((f) => f.file_path === "app/page.tsx")
  if (pageFile) {
    names.add("Page")
    const processed = processPageFile(pageFile.content)
    if (processed) chunks.push(processed)

    // Generate stubs for any components referenced in page.tsx but not generated
    // Match both default imports (import Foo from) and named imports (import { Foo, Bar } from)
    const defaultImportPattern = /import\s+(\w+)\s+from/g
    const namedImportPattern = /import\s*\{([^}]+)\}\s*from/g
    let importMatch: RegExpExecArray | null
    while ((importMatch = defaultImportPattern.exec(pageFile.content)) !== null) {
      const importedName = importMatch[1]
      if (!names.has(importedName)) {
        chunks.push(`// ── ${importedName} (stub – file not generated) ──\nfunction ${importedName}() { return null; }`)
        names.add(importedName)
      }
    }
    while ((importMatch = namedImportPattern.exec(pageFile.content)) !== null) {
      const importedNames = importMatch[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean)
      for (const importedName of importedNames) {
        if (!names.has(importedName) && /^[A-Z]/.test(importedName)) {
          chunks.push(`// ── ${importedName} (stub – file not generated) ──\nfunction ${importedName}() { return null; }`)
          names.add(importedName)
        }
      }
    }
  }

  // Wrap each component chunk in an IIFE so top-level declarations
  // (const, let, var, function) are scoped and cannot collide across
  // components. PascalCase names (component functions) are exported to
  // the outer scope via a return object so other chunks can reference them.
  let chunkIndex = 0
  const wrappedChunks = chunks.map((chunk) => {
    // Extract all PascalCase function/const names that other code may reference.
    const exportedNames: string[] = []
    const funcPattern = /^function\s+([A-Z]\w*)\s*\(/gm
    let funcMatch: RegExpExecArray | null
    while ((funcMatch = funcPattern.exec(chunk)) !== null) {
      exportedNames.push(funcMatch[1])
    }
    const constCompPattern = /^(?:const|let|var)\s+([A-Z]\w*)\s*=/gm
    let constMatch: RegExpExecArray | null
    while ((constMatch = constCompPattern.exec(chunk)) !== null) {
      exportedNames.push(constMatch[1])
    }

    if (exportedNames.length === 0) return chunk

    const idx = chunkIndex++
    const returnObj = exportedNames.map((n) => `  ${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(",\n")
    const varAssignments = exportedNames.map((n) => `var ${n} = __chunk${idx}.${n};`).join("\n")

    return `var __chunk${idx} = (function() {\n${chunk}\n  return {\n${returnObj}\n  };\n})();\n${varAssignments}`
  })

  // Add data-section wrappers for section components (not Nav, Footer, Page)
  const sectionWrappedChunks = wrappedChunks.map((chunk, idx) => {
    // Find which component this chunk defines by matching the file
    const file = idx < componentFiles.length ? componentFiles[idx] : null
    if (!file) return chunk

    const rawName = file.file_path.replace(/\.tsx?$/, "").split("/").pop()!
    const componentName = toPascalCase(rawName)

    // Don't wrap Nav, Footer, or ui components
    if (componentName === "Nav" || componentName === "Footer") return chunk

    const sectionName = rawName.toLowerCase()

    return chunk + `\n// ── Section wrapper: ${componentName} ──\nvar __Orig_${componentName} = ${componentName};\n${componentName} = function __Wrapped${componentName}(props: any) {\n  return <div data-section="${sectionName}" data-component="${file.file_path}">\n    <__Orig_${componentName} {...props} />\n  </div>;\n};`
  })

  return { code: sectionWrappedChunks.join("\n\n"), names }
}

/**
 * Convert a hyphenated filename to PascalCase.
 * e.g. "bento-grid" → "BentoGrid", "3d-card-effect" → "ThreeDCardEffect"
 */
function toPascalCase(name: string): string {
  // Handle leading digits: "3d" → "ThreeD"
  const digitWords: Record<string, string> = {
    "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four",
    "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine",
  }
  let result = name
  if (/^\d/.test(result)) {
    result = result.replace(/^(\d)/, (d) => digitWords[d] ?? d)
  }
  return result
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

function processComponentFile(filePath: string, content: string): string {
  const rawName = filePath
    .replace(/\.tsx?$/, "")
    .split("/")
    .pop()!
  const componentName = toPascalCase(rawName)

  return `// ── ${componentName} ──\n${stripToFunction(content, componentName)}`
}

function processPageFile(content: string): string {
  return `// ── Page ──\n${stripToFunction(content, "Page")}`
}

// NOTE: Type-stripping functions (removeGenericTypeParams, removeTypeDeclarations,
// removeDestructuredTypeAnnotations) were removed — Babel with isTSX:true handles all of it.

/**
 * Strip imports, directives, types, and export keywords from a component file.
 * Rename the default export function to `targetName`.
 */
function stripToFunction(content: string, targetName: string): string {
  let code = content

  // Remove "use client" / "use server" directives
  code = code.replace(/^\s*["']use (client|server)["']\s*;?\s*$/gm, "")

  // Before stripping imports, extract aliased named imports so we can
  // re-create them as variable assignments.  e.g.:
  //   import { HeroSection as AnimatedHero } from "..."
  // becomes:  const AnimatedHero = HeroSection;
  const aliasLines: string[] = []
  const aliasPattern = /^import\s*\{([^}]+)\}\s*from\s+["'][^"']+["']\s*;?\s*$/gm
  let aliasMatch: RegExpExecArray | null
  while ((aliasMatch = aliasPattern.exec(code)) !== null) {
    const specifiers = aliasMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    for (const spec of specifiers) {
      const parts = spec.split(/\s+as\s+/)
      if (parts.length === 2) {
        const original = parts[0].trim()
        const alias = parts[1].trim()
        if (original !== alias) {
          aliasLines.push(`var ${alias} = typeof ${original} !== 'undefined' ? ${original} : undefined;`)
        }
      }
    }
  }

  // Remove import statements (single-line and multi-line)
  // (no module system in preview — all components are inlined)
  code = code.replace(
    /^import\s[\s\S]*?from\s+["'][^"']+["']\s*;?\s*$/gm,
    ""
  )
  code = code.replace(/^import\s+["'][^"']+["']\s*;?\s*$/gm, "")

  // Inject alias assignments after import removal
  if (aliasLines.length > 0) {
    code = aliasLines.join("\n") + "\n" + code
  }

  // Remove duplicate cn() helper — it's defined once in the global shims
  // Must handle multi-line function bodies (the cn in components spans 3 lines)
  // The param list has nested parens so we match the whole signature loosely
  code = code.replace(
    /function cn\(\.\.\.classes[^{]*\{[^}]*\}\s*\n?/g,
    ""
  )

  // Convert <style jsx>{`...`}</style> to a runtime style injection
  // Babel standalone doesn't support the styled-jsx plugin
  // Uses a hash-based dedup to prevent leaking <style> tags on re-renders
  code = code.replace(
    /<style\s+jsx(?:\s+global)?\s*>\s*\{`([\s\S]*?)`\}\s*<\/style>/g,
    (_match, css: string) => {
      const escapedCSS = css.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")
      // Simple hash from CSS content to create a stable ID
      const hashCode = Math.abs(css.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)).toString(36)
      return `{(() => { if (typeof document !== 'undefined') { var id = 'jsx-' + '${hashCode}'; if (!document.getElementById(id)) { var s = document.createElement('style'); s.id = id; s.textContent = '${escapedCSS}'; document.head.appendChild(s); } } return null; })()}`
    }
  )

  // NOTE: TypeScript syntax (interfaces, type annotations, generics, non-null
  // assertions, etc.) is handled by Babel with isTSX:true — no need to strip here.

  // Replace "export default function Xxx" → "function TargetName"
  code = code.replace(
    /export\s+default\s+function\s+\w+/,
    `function ${targetName}`
  )

  // Replace "export function Xxx" → "function Xxx"
  code = code.replace(/export\s+function\s+/g, "function ")

  // Replace "export const" → "const"
  code = code.replace(/export\s+const\s+/g, "const ")

  // Replace "export default Xxx" at end of file → remove
  code = code.replace(/^export\s+default\s+\w+\s*;?\s*$/gm, "")

  // Remove "export type" and "export interface" statements
  code = code.replace(/^export\s+(type|interface)\s+[\s\S]*?(?=\n(?:export|function|const|let|var|\/\*|\/\/|\n|$))/gm, "")

  // Clean up excessive blank lines
  code = code.replace(/\n{3,}/g, "\n\n")

  return code.trim()
}

// ── HTML Assembly ───────────────────────────────────────

interface AssemblyOptions {
  title: string
  fonts: string[]
  fontVariables: Array<{ variable: string; family: string }>
  bodyClasses: string
  tailwindConfig: string
  cssContent: string
  componentCode: string
  componentNames: Set<string>
}

// ── Icon & Shim Registry (generated dynamically to avoid name collisions) ──

const ICON_REGISTRY: Record<string, string> = {
  Phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  Mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  MapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  Clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  Star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  ChevronRight: '<path d="m9 18 6-6-6-6"/>',
  ChevronLeft: '<path d="m15 18-6-6 6-6"/>',
  ChevronDown: '<path d="m6 9 6 6 6-6"/>',
  ChevronUp: '<path d="m18 15-6-6-6 6"/>',
  Menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  ArrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  ArrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  Check: '<path d="M20 6 9 17l-5-5"/>',
  CheckCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  CheckCircle2: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  ExternalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  Globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  Heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  Home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  Instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  Facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  Twitter: '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>',
  Linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  Youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
  Calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  DollarSign: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  Users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  Shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  Sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  Wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  Scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  Utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  Car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  Briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  Building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  Camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  Coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  Zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  ThumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>',
  MessageCircle: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  Send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  Search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  Minus: '<path d="M5 12h14"/>',
  Info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  AlertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  Quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21c0 1 0 1 0 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 0 1z"/>',
  CircleDot: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  Loader2: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
}

function generateIconShims(exclude: Set<string>): string {
  const lines: string[] = []
  for (const [name, paths] of Object.entries(ICON_REGISTRY)) {
    if (!exclude.has(name)) {
      lines.push(`    const ${name} = createIcon('${paths}');`)
    }
  }
  return lines.join("\n")
}

function assembleHTML(opts: AssemblyOptions): string {
  const { title, fonts, fontVariables, bodyClasses, tailwindConfig, cssContent, componentCode, componentNames } = opts

  const fontLinks = fonts
    .map(
      (font) =>
        `<link href="https://fonts.googleapis.com/css2?family=${font}:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`
    )
    .join("\n  ")

  // Build CSS variable definitions for Next.js font variables.
  // Next.js sets these at build time; we replicate them for the preview.
  const fontVarCSS = fontVariables.length > 0
    ? `:root { ${fontVariables.map((f) => `${f.variable}: '${f.family}', sans-serif`).join("; ")}; }`
    : ""

  // Build the primary font-family CSS rule from the first font
  const primaryFont = fonts.length > 0 ? fonts[0].replace(/\+/g, " ") : ""
  const fontCSS = primaryFont
    ? `body { font-family: '${primaryFont}', system-ui, -apple-system, sans-serif; }`
    : ""

  // Escape closing script tags in component code to prevent premature tag closure
  const safeComponentCode = componentCode.replace(/<\/script/gi, "<\\/script")

  // Generate icon shims excluding names that conflict with generated components
  const iconShims = generateIconShims(componentNames)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${fontLinks}
  <script src="https://cdn.tailwindcss.com"></script>
  <script>try { tailwind.config = ${tailwindConfig}; } catch(e) { console.warn('Tailwind config error:', e); }</script>
  <!-- Import map: single React instance shared by framer-motion -->
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react/": "https://esm.sh/react@18.3.1/",
      "react-dom": "https://esm.sh/react-dom@18.3.1",
      "react-dom/": "https://esm.sh/react-dom@18.3.1/",
      "framer-motion": "https://esm.sh/framer-motion@11?external=react,react-dom"
    }
  }
  </script>
  <!-- Use type="text/tailwindcss" so the CDN processes @apply and @layer directives -->
  <style type="text/tailwindcss">
    ${fontVarCSS}
    ${fontCSS}
    img { max-width: 100%; height: auto; }
    ${cssContent}
  </style>
</head>
<body class="${escapeHtml(bodyClasses)}">
  <div id="__next"></div>

  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>

  <!-- Component code stored as inert text — compiled manually with proper TSX config -->
  <script type="text/plain" id="__app_code">
    /* ── Next.js Shims ── */
    const Image = ({ src, alt, width, height, className, fill, priority, style, ...rest }: any) => {
      const imgStyle: any = fill
        ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style }
        : style;
      return <img src={src} alt={alt || ''} width={fill ? undefined : width} height={fill ? undefined : height} className={className} style={imgStyle} loading={priority ? 'eager' : 'lazy'} {...rest} />;
    };
    const Link = ({ href, children, className, ...props }: any) =>
      <a href={href || '#'} className={className} {...props}>{children}</a>;

    /* ── shadcn/ui Shims ── */
    const Button = ({ children, className, variant, size, asChild, ...props }: any) =>
      <button className={className} {...props}>{children}</button>;
    const Card = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const CardContent = Card;
    const CardHeader = Card;
    const CardTitle = ({ children, className, ...props }: any) =>
      <h3 className={className} {...props}>{children}</h3>;
    const CardDescription = ({ children, className, ...props }: any) =>
      <p className={className} {...props}>{children}</p>;
    const CardFooter = Card;
    const Badge = ({ children, className, ...props }: any) =>
      <span className={className} {...props}>{children}</span>;
    const Separator = ({ className, ...props }: any) =>
      <hr className={className} {...props} />;
    const Input = (props: any) => <input {...props} />;
    const Textarea = (props: any) => <textarea {...props} />;
    const Label = ({ children, ...props }: any) => <label {...props}>{children}</label>;
    const Tabs = ({ children, className, defaultValue, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const TabsList = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const TabsTrigger = ({ children, className, ...props }: any) =>
      <button className={className} {...props}>{children}</button>;
    const TabsContent = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const Dialog = ({ children }: any) => <>{children}</>;
    const DialogTrigger = ({ children }: any) => <>{children}</>;
    const DialogContent = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const DialogHeader = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const DialogTitle = ({ children, className, ...props }: any) =>
      <h2 className={className} {...props}>{children}</h2>;
    const DialogDescription = ({ children, className, ...props }: any) =>
      <p className={className} {...props}>{children}</p>;
    const Accordion = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const AccordionItem = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const AccordionTrigger = ({ children, className, ...props }: any) =>
      <button className={className} {...props}>{children}</button>;
    const AccordionContent = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const ScrollArea = ({ children, className, ...props }: any) =>
      <div className={className} style={{ overflow: 'auto' }} {...props}>{children}</div>;
    const Avatar = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const AvatarImage = ({ src, alt, className, ...props }: any) =>
      <img src={src} alt={alt || ''} className={className} {...props} />;
    const AvatarFallback = ({ children, className, ...props }: any) =>
      <span className={className} {...props}>{children}</span>;
    const Select = ({ children }: any) => <>{children}</>;
    const SelectTrigger = ({ children, className, ...props }: any) =>
      <button className={className} {...props}>{children}</button>;
    const SelectContent = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const SelectItem = ({ children, className, ...props }: any) =>
      <div className={className} {...props}>{children}</div>;
    const SelectValue = ({ placeholder }: any) => <span>{placeholder}</span>;

    /* ── Lucide Icons Shim (excludes names used by generated components) ── */
    const createIcon = (paths: string) => ({ className, size, strokeWidth, ...props }: any) => {
      const s = size || 24;
      return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width={s} height={s}
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round"
          {...props} dangerouslySetInnerHTML={{ __html: paths }} />
      );
    };
${iconShims}

    /* ── Utility shim (used by many animated components) ── */
    function cn(...classes: (string | undefined | false | null)[]) {
      return classes.filter(Boolean).join(" ");
    }

    /* ── Next.js navigation shims ── */
    const usePathname = () => '/';
    const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {} });
    const useSearchParams = () => new URLSearchParams();
    const useParams = () => ({});

    /* ── React hooks (destructured from the React param for convenience) ── */
    const { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext, Fragment, useId, useReducer, useLayoutEffect } = React;

    /* ── framer-motion: real library loaded via import map — no shims needed ── */

    /* ── Generated Components ── */
    ${safeComponentCode}

    /* ── Render (wrap with Nav/Footer from layout if available) ── */
    const root = document.getElementById('__next');
    if (root && typeof Page !== 'undefined') {
      try {
        const hasNav = typeof Nav !== 'undefined';
        const hasFooter = typeof Footer !== 'undefined';
        const app = <>
          {hasNav && <Nav />}
          <main><Page /></main>
          {hasFooter && <Footer />}
        </>;
        ReactDOM.createRoot(root).render(app);
      } catch(e) {
        console.error('Preview render error:', e);
        root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:#666;font-family:system-ui"><p>Preview render error. Check console.</p></div>';
      }
    } else if (root) {
      root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:#666;font-family:system-ui"><p>Preview could not render. No Page component found.</p></div>';
    }
  </script>

  <!-- Load real React + framer-motion via ESM, compile & run component code -->
  <script type="module">
    import * as React from 'react';
    import { createRoot } from 'react-dom/client';
    import * as FramerMotion from 'framer-motion';

    // Expose React as global (Babel-compiled JSX uses React.createElement)
    window.React = React;
    window.ReactDOM = { createRoot };

    // Expose ALL framer-motion exports as globals so generated component code
    // can reference motion, useScroll, useTransform, etc. by name after
    // import statements are stripped.
    for (const [key, value] of Object.entries(FramerMotion)) {
      window[key] = value;
    }

    // Compile TSX → JS and execute
    const code = document.getElementById('__app_code').textContent;
    try {
      const result = Babel.transform(code, {
        presets: [
          ['typescript', { isTSX: true, allExtensions: true }],
          'react'
        ],
        filename: 'app.tsx'
      });
      const fn = new Function('React', 'ReactDOM', result.code);
      fn(React, { createRoot });
    } catch(e) {
      console.error('Preview compilation error:', e);
      const root = document.getElementById('__next');
      if (root) root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:#666;font-family:system-ui"><div style="max-width:600px;text-align:center"><p style="font-size:1.1em;margin-bottom:8px">Preview compilation error</p><pre style="text-align:left;background:#f5f5f5;padding:12px;border-radius:8px;font-size:0.8em;overflow:auto;max-height:300px">' + e.message + '</pre></div></div>';
    }
  </script>

  <!-- Section interaction handlers for edit panel -->
  <script>
    (function() {
      // Wait for content to render
      setTimeout(function() {
        document.querySelectorAll('[data-section]').forEach(function(el) {
          // Click to select
          el.addEventListener('click', function(e) {
            // Don't prevent default — allow links to work. Only send message.
            window.parent.postMessage({
              type: 'section-selected',
              section: el.getAttribute('data-section'),
              component: el.getAttribute('data-component'),
            }, '*');
          });
          // Hover highlight
          el.addEventListener('mouseenter', function() {
            el.style.outline = '2px solid rgba(239, 68, 68, 0.5)';
            el.style.outlineOffset = '-2px';
            el.style.transition = 'outline 0.15s ease';
            window.parent.postMessage({
              type: 'section-hover',
              section: el.getAttribute('data-section'),
            }, '*');
          });
          el.addEventListener('mouseleave', function() {
            el.style.outline = 'none';
            window.parent.postMessage({ type: 'section-unhover' }, '*');
          });
        });
      }, 1000); // Wait for React render + Babel compilation
    })();
  </script>

  <!-- Hot-swap listener for section updates + scroll-to-section after edit -->
  <script>
    window.addEventListener('message', function(e) {
      if (!e.data || !e.data.type) return;

      // Sanitize section name: allow only lowercase alphanumeric, hyphens, underscores.
      // Prevents CSS selector injection via querySelector('[data-section="..."]').
      function sanitizeSection(name) {
        if (typeof name !== 'string') return null;
        var clean = name.replace(/[^a-z0-9\-_]/g, '');
        return clean.length > 0 ? clean : null;
      }

      if (e.data.type === 'section-update') {
        var sectionName = sanitizeSection(e.data.section);
        if (!sectionName) return;
        var el = document.querySelector('[data-section="' + sectionName + '"]');
        if (el) el.innerHTML = e.data.html;
      }

      if (e.data.type === 'scroll-to-section') {
        var sectionName = sanitizeSection(e.data.section);
        if (!sectionName) return;
        var el = document.querySelector('[data-section="' + sectionName + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight flash
          el.style.outline = '2px solid rgba(239, 68, 68, 0.6)';
          el.style.outlineOffset = '-2px';
          setTimeout(function() { el.style.outline = 'none'; }, 2000);
        }
      }
    });
  </script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
