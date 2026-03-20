import { logError } from "@radiant/db"

interface ErrorContext {
  route: string
  method?: string
  statusCode?: number
  errorCode?: string
  projectId?: string
  userId?: string
  extra?: Record<string, unknown>
}

/**
 * Log an API error to the error_logs table and console.
 * Fire-and-forget — never throws, never blocks the response.
 */
export function logApiError(error: unknown, context: ErrorContext): void {
  const message =
    error instanceof Error ? error.message : String(error)
  const stack =
    error instanceof Error ? error.stack ?? null : null

  // Always log to console for immediate visibility
  console.error(`[${context.route}]`, message, context.extra ?? "")

  // Persist to DB (fire-and-forget)
  logError({
    route: context.route,
    method: context.method ?? "POST",
    status_code: context.statusCode ?? 500,
    error_message: message,
    error_code: context.errorCode,
    stack_trace: stack ?? undefined,
    request_context: context.extra ?? {},
    user_id: context.userId,
    project_id: context.projectId,
  }).catch(() => {
    // DB logging failure should never affect the API response
  })
}
