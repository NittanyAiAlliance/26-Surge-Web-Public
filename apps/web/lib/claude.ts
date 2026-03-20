import { callModel } from "./ai-client"
import { MODEL_CONFIG, type PipelineStep } from "./model-config"

// ── Types ────────────────────────────────────────────────

export interface GeneratedFile {
  path: string
  content: string
}

export interface GenerationResult {
  files: GeneratedFile[]
  tokensUsed: { input: number; output: number }
  duration: number
  rawResponse: string
}

// ── Response parser ──────────────────────────────────────

/**
 * Strip markdown code fences from file content.
 */
function stripCodeFences(content: string): string {
  return content.replace(/^```[a-zA-Z]*\s*\n/, "").replace(/\n```\s*$/, "")
}

/**
 * Parse response into individual files using `--- FILE: ... ---` markers.
 */
export function parseFileBlocks(raw: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const filePattern = /--- FILE:\s*(.+?)\s*---\n([\s\S]*?)--- END FILE ---/g
  let match: RegExpExecArray | null

  while ((match = filePattern.exec(raw)) !== null) {
    const path = match[1].trim()
    let content = match[2].trimEnd()
    if (path && content) {
      content = stripCodeFences(content)
      files.push({ path, content })
    }
  }

  return files
}

// ── Main generation function ─────────────────────────────

/**
 * Call an AI model to generate website files.
 * Routes to the correct provider based on MODEL_CONFIG for the given step.
 */
export async function generateWebsite(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    step?: PipelineStep
    cacheOptions?: {
      staticPart: string
      dynamicPart: string
    }
  }
): Promise<GenerationResult> {
  const step = options?.step ?? "scaffold"
  const config = MODEL_CONFIG[step]

  const response = await callModel({
    provider: config.provider,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    systemPrompt,
    userPrompt,
    stream: true,
    cacheOptions: options?.cacheOptions,
  })

  const files = parseFileBlocks(response.text)

  return {
    files,
    tokensUsed: response.tokensUsed,
    duration: response.duration,
    rawResponse: response.text,
  }
}

// ── Backward-compat exports ──────────────────────────────

export const DEFAULT_MODEL = MODEL_CONFIG.scaffold.model
export const DEFAULT_MAX_TOKENS = MODEL_CONFIG.scaffold.maxTokens
export const DEFAULT_TEMPERATURE = MODEL_CONFIG.scaffold.temperature
