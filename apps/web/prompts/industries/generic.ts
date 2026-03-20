import { getPrompt } from "../store"

/**
 * Industry-specific prompt fragment for general/unrecognized businesses.
 * Used as fallback when no specific industry template matches.
 */

export const GENERIC_PROMPT = getPrompt("GENERIC_PROMPT")
