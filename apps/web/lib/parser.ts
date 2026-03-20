import type { GeneratedFile } from "./claude"
import { getPrompt, renderPrompt } from "../prompts/store"

// ── Types ────────────────────────────────────────────────

export interface ValidationError {
  type: "missing_file" | "placeholder_content" | "syntax_error"
  file?: string
  message: string
  line?: number
}

export interface ParseResult {
  files: GeneratedFile[]
  valid: boolean
  errors: ValidationError[]
}

// ── Path Validation ─────────────────────────────────────

/**
 * Validate that a file path is safe for use in the generated project.
 * Rejects paths with directory traversal, absolute paths, or unusual characters.
 */
function isValidFilePath(filePath: string): boolean {
  if (!filePath || filePath.length > 200) return false
  if (filePath.includes('..')) return false
  if (filePath.startsWith('/')) return false
  if (filePath.startsWith('\\')) return false
  // Only allow alphanumeric, hyphens, underscores, dots, and forward slashes
  if (!/^[a-zA-Z0-9._\/-]+$/.test(filePath)) return false
  // Must start with a known directory or be a root config file
  const validPrefixes = ['app/', 'components/', 'lib/', 'styles/', 'public/', 'types/']
  const validRootFiles = ['tailwind.config.ts', 'tailwind.config.js', 'next.config.ts', 'next.config.js', 'globals.css', 'tsconfig.json']
  const isValidPrefix = validPrefixes.some(p => filePath.startsWith(p))
  const isValidRoot = validRootFiles.includes(filePath)
  return isValidPrefix || isValidRoot
}

// ── Constants ────────────────────────────────────────────

const REQUIRED_FILES: string[] = []  // validation handled by orchestrator per step

const PLACEHOLDER_PATTERNS = [
  /\blorem\s+ipsum\b/i,
  /\bplaceholder\b/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /\byour[- ](?:company|business|name|phone|address|email|website)\b/i,
  /\b555-\d{4}\b/,
  /\bexample\.com\b/i,
  /\bjohn\s*doe\b/i,
  /\bjane\s*doe\b/i,
  /\b123\s+main\s+st(?:reet)?\b/i,
  /dangerouslySetInnerHTML/,
  /\beval\s*\(/,
]

// Patterns that look like placeholders inside JSX/template strings
const PLACEHOLDER_EXCLUSIONS = [
  // Allow these in comments or string checks
  /\/\//,
  /\/\*/,
  /\*\//,
]

// ── Code Fence Stripping ────────────────────────────────

/**
 * Strip markdown code fences from file content.
 * Claude sometimes wraps file content in ```tsx ... ``` or ```typescript ... ``` blocks.
 * This removes the leading ``` line (with optional language tag) and trailing ```.
 */
function stripCodeFences(content: string): string {
  // Match leading ```[language] line and trailing ``` line
  const stripped = content.replace(/^```[a-zA-Z]*\s*\n/, "").replace(/\n```\s*$/, "")
  return stripped
}

// ── Parsing ──────────────────────────────────────────────

/**
 * Parse Claude's raw text response into individual file objects.
 * Extracts content between `--- FILE: path ---` and `--- END FILE ---` markers.
 */
export function parseFiles(raw: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const filePattern = /--- FILE:\s*(.+?)\s*---\n([\s\S]*?)--- END FILE ---/g
  let match: RegExpExecArray | null

  while ((match = filePattern.exec(raw)) !== null) {
    const filePath = match[1].trim()
    let content = match[2].trimEnd()
    if (!filePath || !content) continue
    if (!isValidFilePath(filePath)) {
      console.warn(`[parser] Rejected unsafe file path: "${filePath}"`)
      continue
    }
    // Strip markdown code fences that Claude may wrap around file content
    content = stripCodeFences(content)
    files.push({ path: filePath, content })
  }

  return files
}

// ── Validation ───────────────────────────────────────────

/**
 * Check that all required files are present.
 */
function validateRequiredFiles(files: GeneratedFile[]): ValidationError[] {
  const errors: ValidationError[] = []
  const paths = new Set(files.map((f) => f.path))

  for (const required of REQUIRED_FILES) {
    if (!paths.has(required)) {
      errors.push({
        type: "missing_file",
        file: required,
        message: `Required file missing: ${required}`,
      })
    }
  }

  return errors
}

/**
 * Check for placeholder/dummy content in generated files.
 */
function validateNoPlaceholders(files: GeneratedFile[]): ValidationError[] {
  const errors: ValidationError[] = []

  for (const file of files) {
    const lines = file.content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment lines
      const trimmed = line.trim()
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        continue
      }

      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(line)) {
          errors.push({
            type: "placeholder_content",
            file: file.path,
            message: `Placeholder content detected: "${line.trim()}"`,
            line: i + 1,
          })
          break // Only report first placeholder per line
        }
      }
    }
  }

  return errors
}

/**
 * Basic syntax checks for TypeScript/TSX files.
 * Checks for unbalanced braces, unclosed strings, and missing exports.
 */
function validateSyntax(files: GeneratedFile[]): ValidationError[] {
  const errors: ValidationError[] = []

  for (const file of files) {
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) {
      continue
    }

    // Check for unbalanced braces
    let braceCount = 0
    let inString = false
    let stringChar = ""
    let inTemplate = false
    let templateDepth = 0

    for (let i = 0; i < file.content.length; i++) {
      const char = file.content[i]
      const prevChar = i > 0 ? file.content[i - 1] : ""

      if (inString) {
        if (char === stringChar && prevChar !== "\\") {
          inString = false
        }
        continue
      }

      if (char === "`") {
        inTemplate = !inTemplate
        continue
      }

      if (inTemplate && char === "$" && file.content[i + 1] === "{") {
        templateDepth++
        continue
      }

      if (inTemplate && templateDepth > 0 && char === "}") {
        templateDepth--
        continue
      }

      // Only track double-quoted strings. Single quotes cause false positives
      // with apostrophes in JSX text content (e.g., "Mario's Pizza").
      if (char === '"') {
        inString = true
        stringChar = char
        continue
      }

      if (!inTemplate) {
        if (char === "{") braceCount++
        if (char === "}") braceCount--
      }
    }

    if (braceCount !== 0) {
      errors.push({
        type: "syntax_error",
        file: file.path,
        message: `Unbalanced braces (${braceCount > 0 ? "missing closing" : "extra closing"} brace${Math.abs(braceCount) > 1 ? "s" : ""})`,
      })
    }

    // Check that component files have a default export or named export
    if (file.path.endsWith(".tsx") && !file.path.includes("tailwind.config")) {
      const hasExport = /\bexport\b/.test(file.content)
      if (!hasExport) {
        errors.push({
          type: "syntax_error",
          file: file.path,
          message: "TSX file has no exports",
        })
      }
    }
  }

  return errors
}

// ── Main parse + validate ────────────────────────────────

/**
 * Parse Claude's raw response and validate the generated files.
 * Returns parsed files along with validation results.
 */
export function parseAndValidate(raw: string): ParseResult {
  const files = parseFiles(raw)
  const errors: ValidationError[] = [
    ...validateRequiredFiles(files),
    ...validateNoPlaceholders(files),
    ...validateSyntax(files),
  ]

  return {
    files,
    valid: errors.length === 0,
    errors,
  }
}

// ── Retry prompt builder ─────────────────────────────────

/**
 * Build a follow-up prompt asking Claude to fix validation errors.
 * Used when the initial generation has issues that need correction.
 */
export function buildFixPrompt(errors: ValidationError[]): string {
  const errorList = errors
    .map((e) => {
      let desc = `- ${e.message}`
      if (e.file) desc += ` (in ${e.file})`
      if (e.line) desc += ` at line ${e.line}`
      return desc
    })
    .join("\n")

  return renderPrompt(getPrompt("FIX_PROMPT_TEMPLATE"), {
    ERROR_LIST: errorList,
  })
}

// ── Exports ──────────────────────────────────────────────

export { REQUIRED_FILES, PLACEHOLDER_PATTERNS }
