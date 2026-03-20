/**
 * POST /api/bulk-generate
 *
 * Bulk website generation endpoint — accepts an array of businesses,
 * generates and deploys websites in parallel, streams progress via SSE.
 *
 * Auth: X-Bulk-API-Key header (internal use only)
 */

import { NextRequest, NextResponse } from "next/server"
import { bulkGenerate } from "../../../lib/bulk-generator"
import type { BulkBusinessInput, BulkProgress, BulkSiteResult } from "../../../lib/bulk-generator"
import { logApiError } from "../../../lib/error-logger"

export const maxDuration = 300

// ── Auth ─────────────────────────────────────────────────

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-bulk-api-key")
  const expectedKey = process.env.BULK_API_KEY
  if (!expectedKey) {
    console.error("[bulk-generate] BULK_API_KEY not configured")
    return false
  }
  return apiKey === expectedKey
}

// ── Validation ───────────────────────────────────────────

function validateBody(body: unknown): { businesses: BulkBusinessInput[] } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" }
  }

  const { businesses } = body as Record<string, unknown>

  if (!Array.isArray(businesses)) {
    return { error: "\"businesses\" must be an array" }
  }

  if (businesses.length === 0) {
    return { error: "At least one business is required" }
  }

  if (businesses.length > 10) {
    return { error: "Maximum 10 businesses per batch" }
  }

  for (let i = 0; i < businesses.length; i++) {
    const biz = businesses[i]
    if (!biz || typeof biz !== "object") {
      return { error: `Business ${i}: must be an object` }
    }

    const { name, location, customContext } = biz as Record<string, unknown>

    if (typeof name !== "string" || name.trim().length === 0) {
      return { error: `Business ${i}: "name" is required` }
    }
    if (name.length > 200) {
      return { error: `Business ${i}: "name" must be under 200 characters` }
    }

    if (typeof location !== "string" || location.trim().length === 0) {
      return { error: `Business ${i}: "location" is required` }
    }
    if (location.length > 200) {
      return { error: `Business ${i}: "location" must be under 200 characters` }
    }

    if (customContext !== undefined && customContext !== null) {
      if (typeof customContext !== "string") {
        return { error: `Business ${i}: "customContext" must be a string` }
      }
      if (customContext.length > 2000) {
        return { error: `Business ${i}: "customContext" must be under 2000 characters` }
      }
    }
  }

  return {
    businesses: businesses.map((b: Record<string, unknown>) => ({
      name: (b.name as string).trim(),
      location: (b.location as string).trim(),
      customContext: typeof b.customContext === "string" ? b.customContext.trim() : undefined,
    })),
  }
}

// ── SSE Helpers ──────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ── Route Handler ────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  // Auth check
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get internal user ID
  const userId = process.env.BULK_INTERNAL_USER_ID
  if (!userId) {
    console.error("[bulk-generate] BULK_INTERNAL_USER_ID not configured")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const validation = validateBody(body)
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { businesses } = validation

  // Check if client wants SSE streaming
  const acceptsSSE = request.headers.get("accept")?.includes("text/event-stream")

  if (acceptsSSE) {
    // ── SSE Streaming Mode ───────────────────────────────
    const encoder = new TextEncoder()
    let keepaliveInterval: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream({
      async start(controller) {
        // Keepalive ping every 15s to prevent timeout
        keepaliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"))
          } catch {
            // Stream already closed
          }
        }, 15_000)

        try {
          const summary = await bulkGenerate(businesses, {
            userId,
            concurrency: 3,
            onProgress: (progress: BulkProgress) => {
              try {
                controller.enqueue(encoder.encode(sseEvent("site-progress", progress)))
              } catch {
                // Stream closed by client
              }
            },
            onSiteComplete: (result: BulkSiteResult) => {
              try {
                const event = result.status === "deployed" ? "site-complete" : "site-error"
                controller.enqueue(encoder.encode(sseEvent(event, result)))
              } catch {
                // Stream closed by client
              }
            },
          })

          controller.enqueue(encoder.encode(sseEvent("batch-complete", summary)))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          try {
            controller.enqueue(
              encoder.encode(sseEvent("error", { error: message }))
            )
          } catch {
            // Stream closed
          }
          logApiError(error, {
            route: "/api/bulk-generate",
            method: "POST",
          })
        } finally {
          if (keepaliveInterval) clearInterval(keepaliveInterval)
          controller.close()
        }
      },
      cancel() {
        if (keepaliveInterval) clearInterval(keepaliveInterval)
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  // ── Non-Streaming Mode (JSON response) ─────────────────
  try {
    const summary = await bulkGenerate(businesses, {
      userId,
      concurrency: 3,
    })
    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logApiError(error, {
      route: "/api/bulk-generate",
      method: "POST",
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
