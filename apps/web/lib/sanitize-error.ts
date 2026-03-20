/** Map internal errors to safe user-facing messages.
 *  Internal details (API URLs, DB connection strings, file paths, SDK
 *  internals) must never reach the client. This function inspects the
 *  raw error and returns a generic, non-leaking message + appropriate
 *  HTTP status code.
 */
export function sanitizeErrorMessage(error: unknown): {
  message: string
  status: number
} {
  const raw = error instanceof Error ? error.message : String(error)

  if (
    raw.includes("timeout") ||
    raw.includes("ETIMEDOUT") ||
    raw.includes("abort")
  ) {
    return { message: "The request timed out. Please try again.", status: 504 }
  }

  if (raw.includes("rate_limit") || raw.includes("429")) {
    return {
      message: "Too many requests. Please wait a moment and try again.",
      status: 429,
    }
  }

  if (raw.includes("quota") || raw.includes("insufficient")) {
    return {
      message: "Service temporarily unavailable. Please try again later.",
      status: 503,
    }
  }

  if (
    raw.includes("authentication") ||
    raw.includes("401") ||
    raw.includes("api_key")
  ) {
    return {
      message: "Service configuration error. Please contact support.",
      status: 500,
    }
  }

  if (raw.includes("no files") || raw.includes("no homepage")) {
    return {
      message: "Generation produced incomplete results. Please try again.",
      status: 500,
    }
  }

  // Generic fallback -- never return the raw internal error
  return { message: "An unexpected error occurred. Please try again.", status: 500 }
}
