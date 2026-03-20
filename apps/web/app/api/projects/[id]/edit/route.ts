import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { getProject, updateProject } from "@radiant/db"
import { stepSmartEdit } from "@/lib/generation-steps"
import { checkRateLimit, regenerateLimiter } from "../../../../../lib/rate-limit"
import { logApiError } from "../../../../../lib/error-logger"

const STALE_EDIT_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

/**
 * POST /api/projects/[id]/edit
 * Smart edit — user provides only an instruction, AI determines which files to edit.
 * Streams SSE progress events.
 *
 * Body: { instruction: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  // Rate limiting
  const rateLimited = await checkRateLimit(
    regenerateLimiter,
    request,
    "Maximum 5 edits per hour."
  )
  if (rateLimited) return rateLimited

  try {
    // Auth check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    // Parse and validate body
    const body = (await request.json()) as { instruction?: string }
    if (!body.instruction || typeof body.instruction !== "string") {
      return NextResponse.json(
        { error: "instruction is required" },
        { status: 400 }
      )
    }

    // Sanitize instruction length
    const MAX_INSTRUCTION_LENGTH = 2000
    const instruction = body.instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH)
    if (instruction.length === 0) {
      return NextResponse.json(
        { error: "instruction cannot be empty" },
        { status: 400 }
      )
    }

    // Verify project ownership
    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }
    if (project.user_id !== user.id) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      )
    }

    // Can only edit when in preview or deployed state
    if (project.status !== "preview" && project.status !== "deployed") {
      return NextResponse.json(
        { error: `Cannot edit while project is ${project.status}` },
        { status: 409 }
      )
    }

    // Concurrency guard — check if already editing
    if (project.generation_step === "editing") {
      const updatedAt = new Date(project.updated_at).getTime()
      const elapsed = Date.now() - updatedAt

      if (elapsed < STALE_EDIT_TIMEOUT_MS) {
        return NextResponse.json(
          { error: "Another edit is already in progress" },
          { status: 409 }
        )
      }
      // Stale edit — auto-reset
      await updateProject(projectId, { generation_step: null })
    }

    // Mark project as editing
    await updateProject(projectId, { generation_step: "editing" })

    // Stream SSE response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(data: Record<string, unknown>) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          )
        }

        try {
          const result = await stepSmartEdit(
            projectId,
            instruction,
            (event) => sendEvent(event),
          )

          sendEvent({
            status: "complete",
            edits: result.edits,
            routerDecision: result.routerDecision,
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Smart edit failed"
          sendEvent({ status: "failed", error: message })
          logApiError(error, {
            route: "/api/projects/[id]/edit",
            method: "POST",
            statusCode: 500,
            projectId,
            extra: { instruction: instruction.slice(0, 100) },
          })
        } finally {
          // Always restore project status
          await updateProject(projectId, { generation_step: null })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    logApiError(error, {
      route: "/api/projects/[id]/edit",
      method: "POST",
      statusCode: 500,
      projectId,
    })
    const message =
      error instanceof Error ? error.message : "Failed to start edit"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
