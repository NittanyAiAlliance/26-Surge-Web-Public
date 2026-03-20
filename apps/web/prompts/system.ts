import { getPrompt } from "./store"

/**
 * Base system prompt included in every website generation call.
 * Contains code rules and output format. The model makes its own
 * design decisions based on the business data provided.
 */

export const BASE_SYSTEM_PROMPT = getPrompt("BASE_SYSTEM_PROMPT")

/**
 * Returns the base system prompt. No dynamic injection needed —
 * the prompt is self-contained.
 */
export function getBaseSystemPrompt(): string {
  return BASE_SYSTEM_PROMPT
}

/**
 * Split the system prompt into a static (cacheable) part and a dynamic part.
 * Since the prompt no longer has dynamic placeholders, the entire prompt
 * is static and the dynamic part is empty.
 */
export function getSystemPromptParts(): {
  staticPart: string
  dynamicPart: string
} {
  return {
    staticPart: BASE_SYSTEM_PROMPT,
    dynamicPart: "",
  }
}
