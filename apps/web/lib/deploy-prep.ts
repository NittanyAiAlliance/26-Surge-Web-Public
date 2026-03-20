import { readFileSync } from "fs"
import { join, resolve } from "path"
import type { FileMap } from "./vercel"

// ── Types ────────────────────────────────────────────────

export interface ProjectFile {
  file_path: string
  content: string
}

export interface PreparedDeployment {
  /** Complete file map ready for Vercel createDeployment */
  files: FileMap
  /** Number of shadcn/ui components detected and included */
  componentCount: number
  /** Names of detected shadcn/ui components */
  detectedComponents: string[]
}

// ── shadcn/ui component detection ───────────────────────

/**
 * All shadcn/ui components available for bundling.
 * These map to files in our platform's components/ui/ directory.
 */
const AVAILABLE_COMPONENTS = [
  "accordion",
  "avatar",
  "badge",
  "button",
  "card",
  "dialog",
  "dropdown-menu",
  "input",
  "label",
  "scroll-area",
  "select",
  "separator",
  "sheet",
  "skeleton",
  "tabs",
  "textarea",
] as const

/**
 * Components that depend on other components.
 * When a component is detected, its dependencies are also included.
 */
const COMPONENT_DEPS: Record<string, string[]> = {
  dialog: ["button"],
  sheet: ["button"],
  "dropdown-menu": ["button"],
}

/**
 * Scan all generated file contents for @/components/ui/* imports.
 * Returns deduplicated list of component names.
 */
function detectShadcnComponents(files: ProjectFile[]): string[] {
  const detected = new Set<string>()
  // Match: from "@/components/ui/button" or from '@/components/ui/card'
  const importPattern = /from\s+["']@\/components\/ui\/([a-z-]+)["']/g

  for (const file of files) {
    let match: RegExpExecArray | null
    while ((match = importPattern.exec(file.content)) !== null) {
      const componentName = match[1]
      if (AVAILABLE_COMPONENTS.includes(componentName as typeof AVAILABLE_COMPONENTS[number])) {
        detected.add(componentName)
      }
    }
  }

  // Resolve transitive dependencies
  const withDeps = new Set(detected)
  for (const name of detected) {
    const deps = COMPONENT_DEPS[name]
    if (deps) {
      for (const dep of deps) {
        withDeps.add(dep)
      }
    }
  }

  return Array.from(withDeps).sort()
}

/**
 * Read a shadcn/ui component source file from the platform's components directory.
 */
function readComponentSource(componentName: string): string {
  // Defense-in-depth: validate component name even though caller should have checked
  if (!/^[a-z][a-z0-9-]*$/.test(componentName)) {
    throw new Error(`Invalid component name: "${componentName}"`)
  }
  const filePath = join(
    process.cwd(),
    "components",
    "ui",
    `${componentName}.tsx`
  )
  // Verify resolved path is within expected directory
  const resolved = resolve(filePath)
  const expectedDir = resolve(join(process.cwd(), "components", "ui"))
  if (!resolved.startsWith(expectedDir)) {
    throw new Error(`Path traversal blocked for component: "${componentName}"`)
  }
  return readFileSync(filePath, "utf-8")
}

// ── Animated component dependency detection ─────────────

/**
 * Well-known npm packages used by animated component libraries.
 * Maps import patterns to the npm dependency and version that provides them.
 */
const ANIMATED_DEPENDENCY_MAP: Record<string, { pkg: string; version: string }> = {
  "framer-motion": { pkg: "framer-motion", version: "^11.0.0" },
  "motion": { pkg: "framer-motion", version: "^11.0.0" },
  "@react-spring/web": { pkg: "@react-spring/web", version: "^9.7.0" },
  "react-intersection-observer": { pkg: "react-intersection-observer", version: "^9.10.0" },
}

/**
 * Scan generated files for imports of animated component libraries.
 * Returns a map of package name → version string for any detected animated dependencies.
 */
export function detectAnimatedDependencies(files: ProjectFile[]): Record<string, string> {
  const deps: Record<string, string> = {}
  const importPattern = /from\s+["']([^"'.][^"']*)["']/g

  for (const file of files) {
    let match: RegExpExecArray | null
    while ((match = importPattern.exec(file.content)) !== null) {
      const importPath = match[1]
      // Check against known animated dependency packages
      for (const [pattern, dep] of Object.entries(ANIMATED_DEPENDENCY_MAP)) {
        if (importPath === pattern || importPath.startsWith(`${pattern}/`)) {
          deps[dep.pkg] = dep.version
        }
      }
    }
  }

  return deps
}

// ── Config file generators ──────────────────────────────

function generatePackageJson(additionalDependencies?: Record<string, string>): string {
  const baseDeps: Record<string, string> = {
    next: "16.1.6",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "lucide-react": "^0.460.0",
    "radix-ui": "^1.4.0",
  }

  // Validate additional dependency names before merging
  const validNpmName = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
  if (additionalDependencies) {
    for (const name of Object.keys(additionalDependencies)) {
      if (!validNpmName.test(name)) {
        throw new Error(`Invalid npm dependency name: "${name}"`)
      }
    }
  }

  // Merge any additional dependencies (e.g. framer-motion for animated components)
  const dependencies = {
    ...baseDeps,
    ...(additionalDependencies ?? {}),
  }

  return JSON.stringify(
    {
      name: "generated-site",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies,
      devDependencies: {
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        tailwindcss: "^3.4.0",
        "tailwindcss-animate": "^1.0.7",
        autoprefixer: "^10.4.0",
        postcss: "^8.4.0",
        typescript: "^5",
      },
    },
    null,
    2
  )
}

/**
 * Extract unique image hostnames from all project files.
 * Scans for all https URLs and includes every external hostname.
 * Next.js Image component blocks any domain not in remotePatterns,
 * so we must be inclusive — better to allow too many than too few.
 */
function extractImageDomains(projectFiles: ProjectFile[]): string[] {
  const domains = new Set<string>()
  // Always include Google Places API (most sites use it)
  domains.add("places.googleapis.com")
  domains.add("lh3.googleusercontent.com")

  const urlPattern = /https?:\/\/([a-zA-Z0-9.-]+)/g
  for (const file of projectFiles) {
    let match: RegExpExecArray | null
    while ((match = urlPattern.exec(file.content)) !== null) {
      const hostname = match[1]
      if (
        hostname.includes(".") &&
        !hostname.startsWith("localhost") &&
        !hostname.startsWith("127.") &&
        !hostname.startsWith("0.")
      ) {
        domains.add(hostname)
      }
    }
  }

  return Array.from(domains)
}

function generateNextConfig(imageDomains: string[] = []): string {
  if (imageDomains.length === 0) {
    return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`
  }

  const remotePatterns = imageDomains
    .map((hostname) => `      { protocol: "https", hostname: "${hostname}" },`)
    .join("\n")

  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
${remotePatterns}
    ],
  },
};

export default nextConfig;
`
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: {
          "@/*": ["./*"],
        },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  )
}

function generatePostCssConfig(): string {
  return `const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
`
}

function generateUtilsTs(): string {
  return `import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`
}

/**
 * Default globals.css with Tailwind v3 setup and shadcn/ui theme variables.
 * Used only if the generated files don't include their own globals.css.
 */
function generateDefaultGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --radius: 0.625rem;
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`
}

function generateTailwindConfig(): string {
  return `import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
`
}

// ── Tailwind Config Merging ──────────────────────────────

/**
 * Ensure a generated tailwind.config.ts includes shadcn/ui color mappings.
 * Without these, utilities like `border-border`, `bg-background`, `text-foreground`
 * won't resolve and will crash the Tailwind build.
 */
function ensureShadcnColors(config: string): string {
  // shadcn/ui colors that must exist for @apply border-border etc. to work
  const requiredColors: Record<string, string> = {
    border: '"hsl(var(--border))"',
    input: '"hsl(var(--input))"',
    ring: '"hsl(var(--ring))"',
    background: '"hsl(var(--background))"',
    foreground: '"hsl(var(--foreground))"',
    secondary: `{
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        }`,
    destructive: `{
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        }`,
    muted: `{
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        }`,
    accent: `{
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        }`,
    popover: `{
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        }`,
    card: `{
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        }`,
  }

  // Also ensure borderRadius is present
  const needsBorderRadius = !config.includes("borderRadius")

  // Find the `colors:` block inside `extend:`
  const colorsIdx = config.indexOf("colors:")
  if (colorsIdx === -1) return config // no colors block — unusual, leave as-is

  // Find the opening brace of colors
  const colorsStart = config.indexOf("{", colorsIdx)
  if (colorsStart === -1) return config

  // Collect missing color keys
  const missingEntries: string[] = []
  for (const [key, value] of Object.entries(requiredColors)) {
    // Check if this color key already exists in the config
    // Match the key as a standalone property (not as a substring of another key)
    const keyPattern = new RegExp(`(?:^|[\\s,{])${key}\\s*:`, "m")
    if (!keyPattern.test(config)) {
      missingEntries.push(`        ${key}: ${value},`)
    }
  }

  if (missingEntries.length === 0 && !needsBorderRadius) return config

  let result = config

  // Inject missing colors right after the opening brace of colors:
  if (missingEntries.length > 0) {
    const injection = "\n" + missingEntries.join("\n") + "\n"
    result = result.slice(0, colorsStart + 1) + injection + result.slice(colorsStart + 1)
  }

  // Inject borderRadius if missing
  if (needsBorderRadius) {
    // Find the closing of colors block and inject after it
    // Look for `extend: {` and inject borderRadius alongside colors
    const extendIdx = result.indexOf("extend:")
    if (extendIdx !== -1) {
      // Find the last } before the final config closing
      const borderRadiusBlock = `
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },`
      // Insert after the colors block closes — find colors closing brace
      const colorsStartUpdated = result.indexOf("colors:", extendIdx)
      if (colorsStartUpdated !== -1) {
        const braceStart = result.indexOf("{", colorsStartUpdated)
        let depth = 0
        let colorsEnd = braceStart
        for (let i = braceStart; i < result.length; i++) {
          if (result[i] === "{") depth++
          else if (result[i] === "}") {
            depth--
            if (depth === 0) { colorsEnd = i; break }
          }
        }
        // Insert after the colors closing brace + comma
        const insertAt = result.indexOf(",", colorsEnd) !== -1 && result.indexOf(",", colorsEnd) === colorsEnd + 1
          ? colorsEnd + 2
          : colorsEnd + 1
        result = result.slice(0, insertAt) + borderRadiusBlock + result.slice(insertAt)
      }
    }
  }

  return result
}

// ── CSS Sanitization ─────────────────────────────────────

/**
 * Fix Tailwind v4 syntax that breaks in v3 builds.
 *
 * The main offender: opacity modifier syntax (`bg-primary/50`, `border-accent/20`)
 * inside `@apply` directives. This works in HTML class attributes but crashes
 * PostCSS/Tailwind v3 when used in `@apply`.
 *
 * Fix: convert `utility/N` → `utility prefix-opacity-[0.N]` inside @apply lines.
 */
export function sanitizeTailwindCss(css: string): string {
  // Match @apply directives that contain /N opacity modifiers
  return css.replace(
    /@apply\s+([^;{]+)/g,
    (fullMatch, classesStr: string) => {
      // Only process if there's actually a /N pattern
      if (!/\/\d+/.test(classesStr)) return fullMatch

      const fixed = classesStr.replace(
        /(?<!\w:)\b((?:bg|text|border|ring|divide|placeholder|outline|shadow|from|via|to)-[\w-]+?)\/(\d+)\b/g,
        (_m: string, utilClass: string, opacityStr: string) => {
          const opacity = parseInt(opacityStr, 10)
          const opacityDecimal = opacity <= 1 ? opacity : opacity / 100

          // Extract the prefix (bg, text, border, etc.)
          const prefixMatch = utilClass.match(/^(bg|text|border|ring|divide|placeholder|outline|shadow|from|via|to)/)
          if (!prefixMatch) return utilClass // fallback: just strip the /N

          const prefix = prefixMatch[1]

          // Map prefix to the correct opacity utility
          const opacityMap: Record<string, string> = {
            bg: "bg-opacity",
            text: "text-opacity",
            border: "border-opacity",
            ring: "ring-opacity",
            divide: "divide-opacity",
            placeholder: "placeholder-opacity",
            // For gradient stops / outline / shadow, just strip opacity (no v3 equivalent)
            from: "",
            via: "",
            to: "",
            outline: "",
            shadow: "",
          }

          const opacityUtil = opacityMap[prefix]
          if (opacityUtil) {
            return `${utilClass} ${opacityUtil}-[${opacityDecimal}]`
          }
          return utilClass // strip the /N for unsupported prefixes
        }
      )

      return `@apply ${fixed}`
    }
  )
}

// ── Client directive enforcement ────────────────────────

/**
 * Event handler props and hooks that require "use client".
 * If a file uses any of these but lacks the directive, Next.js
 * will fail at build time with "Event handlers cannot be passed
 * to Client Component props."
 */
const CLIENT_MARKERS = [
  /\bonClick\b/,
  /\bonChange\b/,
  /\bonSubmit\b/,
  /\bonInput\b/,
  /\bonFocus\b/,
  /\bonBlur\b/,
  /\bonKeyDown\b/,
  /\bonKeyUp\b/,
  /\bonMouseEnter\b/,
  /\bonMouseLeave\b/,
  /\bonScroll\b/,
  /\bonTouchStart\b/,
  /\buseState\b/,
  /\buseEffect\b/,
  /\buseRef\b/,
  /\buseCallback\b/,
  /\buseReducer\b/,
  /\buseContext\b/,
]

/**
 * Ensure files that use event handlers or React hooks have
 * the "use client" directive. Without it Next.js App Router
 * treats them as Server Components and the build fails.
 */
function ensureClientDirectives(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    // Only check TSX/JSX files in the app or components directory
    if (!path.endsWith(".tsx") && !path.endsWith(".jsx")) continue
    // Skip if already has the directive
    if (/^\s*["']use client["']/.test(content)) continue

    const needsClient = CLIENT_MARKERS.some((re) => re.test(content))
    if (needsClient) {
      files[path] = `"use client"\n\n${content}`
    }
  }
}

// ── Google Font weight sanitization ─────────────────────

/**
 * Fonts that only support weight 400. If the generated code specifies
 * other weights for these fonts, the Next.js build will crash with
 * "Missing weight for X. Available weights: 400".
 */
const SINGLE_WEIGHT_FONTS = new Set([
  "DM Serif Display",
  "DM Serif Text",
  "Abril Fatface",
  "Lobster",
  "Lobster Two",
  "Pacifico",
  "Satisfy",
  "Great Vibes",
  "Dancing Script",
  "Caveat",
  "Permanent Marker",
  "Righteous",
  "Alfa Slab One",
  "Bungee",
  "Fredoka One",
  "Passion One",
  "Patua One",
  "Russo One",
  "Sigmar One",
  "Titan One",
  "Bangers",
  "Creepster",
  "Monoton",
])

/**
 * Fix invalid Google Font weight configurations in layout files.
 * AI models frequently either omit the weight property entirely or assign
 * weights like 700 that don't exist, crashing the Next.js build with
 * "Missing weight for X. Available weights: 400".
 *
 * Strategy:
 * 1. For known single-weight fonts: ensure weight is "400" (add if missing, fix if wrong)
 * 2. For ALL font calls: ensure a weight property exists (add "400" if missing entirely)
 */
function sanitizeGoogleFontWeights(files: Record<string, string>): void {
  const layoutPath = "app/layout.tsx"
  const content = files[layoutPath]
  if (!content) return

  let fixed = content

  // Build a set of single-weight font import names (with underscores)
  const singleWeightImportNames = new Set<string>()
  for (const fontName of SINGLE_WEIGHT_FONTS) {
    singleWeightImportNames.add(fontName.replace(/\s+/g, "_"))
  }

  // Find all font function calls: FontName({ ...options })
  // Match the function name and the full options object
  fixed = fixed.replace(
    /(\b([A-Z][A-Za-z0-9_]+)\s*\(\s*\{)([^}]*)\}/g,
    (fullMatch, prefix: string, fnName: string, optionsBody: string) => {
      // Only process if it looks like a font call (imported from next/font/google)
      // Check if this function name appears in an import from next/font/google
      const importPattern = new RegExp(
        `import\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*from\\s*["']next/font/google["']`
      )
      if (!importPattern.test(fixed)) return fullMatch

      const hasWeight = /\bweight\s*:/.test(optionsBody)
      const isSingleWeight = singleWeightImportNames.has(fnName)

      if (isSingleWeight && hasWeight) {
        // Fix wrong weight to "400"
        const fixedOptions = optionsBody.replace(
          /(\bweight\s*:\s*)(?:"[^"]*"|'[^']*'|\[[^\]]*\])/,
          '$1"400"'
        )
        return `${prefix}${fixedOptions}}`
      }

      if (isSingleWeight && !hasWeight) {
        // Add weight: "400" to single-weight font
        return `${prefix}\n  weight: "400",${optionsBody}}`
      }

      if (!hasWeight) {
        // Non-single-weight font but missing weight entirely — add "400" as safe default
        // This prevents "Missing weight" errors for any font
        return `${prefix}\n  weight: "400",${optionsBody}}`
      }

      return fullMatch
    }
  )

  if (fixed !== content) {
    files[layoutPath] = fixed
    console.log("[deploy-prep] Fixed Google Font weights in layout.tsx")
  }
}

// ── Main preparation function ───────────────────────────

/**
 * Assemble the complete file tree for deploying a generated site to Vercel.
 *
 * Takes the raw project files from the database and adds:
 * - package.json with all required dependencies
 * - next.config.ts (if not already generated)
 * - tsconfig.json
 * - postcss.config.mjs
 * - lib/utils.ts (cn helper for shadcn/ui)
 * - app/globals.css (if not already generated)
 * - All detected shadcn/ui component source files
 */
export function prepareDeployment(
  projectFiles: ProjectFile[],
  options?: { additionalDependencies?: Record<string, string> }
): PreparedDeployment {
  const files: FileMap = {}

  // Index existing generated file paths for quick lookup
  const existingPaths = new Set(projectFiles.map((f) => f.file_path))

  // 1. Add all generated project files (with CSS sanitization)
  for (const file of projectFiles) {
    files[file.file_path] = file.file_path.endsWith(".css")
      ? sanitizeTailwindCss(file.content)
      : file.content
  }

  // 2. Always add package.json (system prompt tells Claude not to generate it)
  files["package.json"] = generatePackageJson(options?.additionalDependencies)

  // 3. Add next.config.ts with image domains (always overwrite to ensure domains are correct)
  const imageDomains = extractImageDomains(projectFiles)
  files["next.config.ts"] = generateNextConfig(imageDomains)

  // 4. Always add tsconfig.json (standalone, not extending parent)
  files["tsconfig.json"] = generateTsConfig()

  // 5. Add postcss.config.mjs
  files["postcss.config.mjs"] = generatePostCssConfig()

  // 5b. Add tailwind.config.ts if Claude didn't generate one,
  //     or merge shadcn color mappings into the generated one
  if (!existingPaths.has("tailwind.config.ts") && !existingPaths.has("tailwind.config.js")) {
    files["tailwind.config.ts"] = generateTailwindConfig()
  } else {
    // Claude generated a tailwind config — ensure it has shadcn/ui color mappings
    // so that @apply border-border, bg-background, etc. resolve correctly
    const configKey = existingPaths.has("tailwind.config.ts") ? "tailwind.config.ts" : "tailwind.config.js"
    const existingConfig = files[configKey]
    if (existingConfig) {
      files[configKey] = ensureShadcnColors(existingConfig)
    }
  }

  // 6. Add lib/utils.ts (cn helper required by shadcn/ui components)
  if (!existingPaths.has("lib/utils.ts")) {
    files["lib/utils.ts"] = generateUtilsTs()
  }

  // 7. Add globals.css if not already generated
  if (!existingPaths.has("app/globals.css") && !existingPaths.has("globals.css")) {
    files["app/globals.css"] = generateDefaultGlobalsCss()
  }

  // 8. Detect and include shadcn/ui components
  const detectedComponents = detectShadcnComponents(projectFiles)
  for (const name of detectedComponents) {
    const componentPath = `components/ui/${name}.tsx`
    // Only add if Claude didn't already inline the component
    if (!existingPaths.has(componentPath)) {
      files[componentPath] = readComponentSource(name)
    }
  }

  // Auto-add "use client" to files that use event handlers or hooks
  // to prevent Next.js build failures in App Router
  ensureClientDirectives(files)

  // Fix invalid Google Font weight configurations that crash the build
  sanitizeGoogleFontWeights(files)

  return {
    files,
    componentCount: detectedComponents.length,
    detectedComponents,
  }
}
