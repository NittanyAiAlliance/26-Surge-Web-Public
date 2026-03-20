import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import type { Provider } from "./model-config"

// ── Types ────────────────────────────────────────────────

export interface ModelCallOptions {
  provider: Provider
  model: string
  maxTokens: number
  temperature: number
  timeoutMs: number
  systemPrompt: string
  userPrompt: string
  /** true → Anthropic uses messages.stream(); false → messages.create() */
  stream: boolean
  /** Anthropic-only: prompt caching. Ignored for other providers. */
  cacheOptions?: { staticPart: string; dynamicPart: string }
}

export interface ModelResponse {
  text: string
  tokensUsed: { input: number; output: number }
  duration: number
  stopReason: string
  model: string
}

// ── Prompt size validation ───────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const PROMPT_SIZE_WARNING_TOKENS = 60_000
const PROMPT_SIZE_ERROR_TOKENS = 100_000

function logPromptSize(
  provider: string,
  model: string,
  systemText: string,
  userPrompt: string,
  maxTokens: number
): void {
  const estimatedSystemTokens = estimateTokens(systemText)
  const estimatedUserTokens = estimateTokens(userPrompt)
  const estimatedTotalInput = estimatedSystemTokens + estimatedUserTokens

  if (estimatedTotalInput > PROMPT_SIZE_ERROR_TOKENS) {
    console.error(
      `[ai-client] CRITICAL: Estimated input tokens (${estimatedTotalInput}) exceed ${PROMPT_SIZE_ERROR_TOKENS}. ` +
        `System: ~${estimatedSystemTokens}, User: ~${estimatedUserTokens}. ` +
        `Provider: ${provider}, Model: ${model}, maxTokens: ${maxTokens}`
    )
  } else if (estimatedTotalInput > PROMPT_SIZE_WARNING_TOKENS) {
    console.warn(
      `[ai-client] WARNING: Estimated input tokens (${estimatedTotalInput}) exceed ${PROMPT_SIZE_WARNING_TOKENS}. ` +
        `System: ~${estimatedSystemTokens}, User: ~${estimatedUserTokens}. Provider: ${provider}, Model: ${model}`
    )
  }

  console.log(
    `[ai-client] Calling ${provider}/${model} — est. input: ~${estimatedTotalInput} tokens ` +
      `(system: ~${estimatedSystemTokens}, user: ~${estimatedUserTokens}), maxOutput: ${maxTokens}`
  )
}

// ── Retry logic ──────────────────────────────────────────

const MAX_RETRIES = 1

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("rate_limit") ||
    msg.includes("429") ||
    msg.includes("529") ||
    msg.includes("overloaded") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503")
  )
}

// ── Client singletons ────────────────────────────────────

let anthropicClient: Anthropic | null = null
let zaiClient: OpenAI | null = null

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set")
    }
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

function getZaiClient(): OpenAI {
  if (!zaiClient) {
    const apiKey = process.env.ZAI_API_KEY
    if (!apiKey) {
      throw new Error("ZAI_API_KEY environment variable is not set")
    }
    zaiClient = new OpenAI({
      apiKey,
      baseURL: "https://api.z.ai/api/paas/v4",
    })
  }
  return zaiClient
}

// ── Anthropic provider ───────────────────────────────────

async function callAnthropic(
  options: ModelCallOptions,
  timeoutSignal: AbortSignal
): Promise<ModelResponse> {
  const anthropic = getAnthropicClient()
  const startTime = Date.now()

  // Build system parameter with optional caching
  const systemParam = options.cacheOptions?.staticPart
    ? [
        {
          type: "text" as const,
          text: options.cacheOptions.staticPart,
          cache_control: { type: "ephemeral" as const },
        },
        // Only include dynamicPart block if non-empty
        ...(options.cacheOptions.dynamicPart
          ? [{ type: "text" as const, text: options.cacheOptions.dynamicPart }]
          : []),
      ]
    : options.systemPrompt

  const systemText = options.cacheOptions?.staticPart
    ? options.cacheOptions.staticPart + (options.cacheOptions.dynamicPart ?? "")
    : options.systemPrompt

  logPromptSize("anthropic", options.model, systemText, options.userPrompt, options.maxTokens)

  const requestParams = {
    model: options.model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    system: systemParam,
    messages: [{ role: "user" as const, content: options.userPrompt }],
  }

  let response: Anthropic.Message

  if (options.stream) {
    const stream = anthropic.messages.stream(requestParams, {
      signal: timeoutSignal,
    })
    response = await stream.finalMessage()
  } else {
    response = await anthropic.messages.create(requestParams, {
      signal: timeoutSignal,
    })
  }

  // Log actual token usage
  const usage = response.usage
  console.log(
    `[ai-client] anthropic/${options.model} response — input: ${usage.input_tokens}, ` +
      `output: ${usage.output_tokens}, stop: ${response.stop_reason}` +
      (usage.cache_creation_input_tokens
        ? `, cache_write: ${usage.cache_creation_input_tokens}`
        : "") +
      (usage.cache_read_input_tokens
        ? `, cache_read: ${usage.cache_read_input_tokens}`
        : "")
  )

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")

  return {
    text,
    tokensUsed: {
      input: usage.input_tokens,
      output: usage.output_tokens,
    },
    duration: Date.now() - startTime,
    stopReason: response.stop_reason ?? "unknown",
    model: options.model,
  }
}

// ── z.ai (OpenAI-compatible) provider ────────────────────

async function callZai(
  options: ModelCallOptions,
  timeoutSignal: AbortSignal
): Promise<ModelResponse> {
  const client = getZaiClient()
  const startTime = Date.now()

  logPromptSize("zai", options.model, options.systemPrompt, options.userPrompt, options.maxTokens)

  const response = await client.chat.completions.create(
    {
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
    },
    { signal: timeoutSignal }
  )

  const usage = response.usage
  const text = response.choices[0]?.message?.content ?? ""
  const finishReason = response.choices[0]?.finish_reason ?? "unknown"

  console.log(
    `[ai-client] zai/${options.model} response — input: ${usage?.prompt_tokens ?? 0}, ` +
      `output: ${usage?.completion_tokens ?? 0}, stop: ${finishReason}`
  )

  // Normalize stop reason to match Anthropic conventions
  const stopReason =
    finishReason === "stop"
      ? "end_turn"
      : finishReason === "length"
        ? "max_tokens"
        : finishReason

  return {
    text,
    tokensUsed: {
      input: usage?.prompt_tokens ?? 0,
      output: usage?.completion_tokens ?? 0,
    },
    duration: Date.now() - startTime,
    stopReason,
    model: options.model,
  }
}

// ── Main entry point ─────────────────────────────────────

/**
 * Call an AI model with automatic provider routing, timeout, and retry.
 */
export async function callModel(
  options: ModelCallOptions
): Promise<ModelResponse> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs)

    try {
      if (attempt > 0) {
        const backoffMs = attempt * 5_000
        console.warn(
          `[ai-client] Retry attempt ${attempt} after ${backoffMs / 1000}s backoff...`
        )
        await new Promise((r) => setTimeout(r, backoffMs))
      }

      let response: ModelResponse

      switch (options.provider) {
        case "anthropic":
          response = await callAnthropic(options, controller.signal)
          break
        case "zai":
          response = await callZai(options, controller.signal)
          break
        default:
          throw new Error(`Unknown provider: ${options.provider}`)
      }

      // Warn on truncation
      if (response.stopReason === "max_tokens") {
        console.warn(
          `[ai-client] Response truncated: stop_reason is "max_tokens". ` +
            `The model hit the ${options.maxTokens} token limit — output may be incomplete.`
        )
      } else if (response.stopReason !== "end_turn") {
        console.warn(
          `[ai-client] Unexpected stop_reason: "${response.stopReason}". Expected "end_turn".`
        )
      }

      return response
    } catch (error) {
      lastError = error
      if (controller.signal.aborted) {
        lastError = new Error(
          `AI API call timed out after ${options.timeoutMs / 1000}s (${options.provider}/${options.model}). ` +
            `The generation took too long and was aborted.`
        )
      }
      if (attempt < MAX_RETRIES && isRetryableError(lastError)) {
        console.warn(
          `[ai-client] Attempt ${attempt + 1} failed with retryable error: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`
        )
        continue
      }
      throw lastError
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw lastError
}
