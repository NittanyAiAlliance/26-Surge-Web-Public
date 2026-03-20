import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import {
  getProject,
  getProjectSections,
  getProjectFileByPath,
  saveFileVersion,
  updateProject,
} from "@radiant/db"
import { stepSectionEdit } from "@/lib/generation-steps"
import { logApiError } from "../../../../../../lib/error-logger"

const STALE_EDIT_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

/**
 * POST /api/projects/[id]/sections/edit
 * Edits a single section component via AI generation.
 * Streams SSE progress events back to the client.
 *
 * Body: { sectionName: string, pagePath: string, instruction: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

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
    const body = (await request.json()) as {
      sectionName?: string
      pagePath?: string
      instruction?: string
    }

    if (!body.sectionName || typeof body.sectionName !== "string") {
      return NextResponse.json(
        { error: "sectionName is required" },
        { status: 400 }
      )
    }
    if (!body.pagePath || typeof body.pagePath !== "string") {
      return NextResponse.json(
        { error: "pagePath is required" },
        { status: 400 }
      )
    }
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

    const sectionName = body.sectionName.trim()
    const pagePath = body.pagePath.trim()

    // Validate inputs
    if (sectionName.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(sectionName)) {
      return NextResponse.json(
        { error: "Invalid section name" },
        { status: 400 }
      )
    }
    if (
      pagePath.length > 100 ||
      (pagePath !== "/" && !/^\/[a-zA-Z0-9_-]+$/.test(pagePath))
    ) {
      return NextResponse.json(
        { error: "Invalid page path" },
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

    // Look up the section
    const sections = await getProjectSections(projectId)
    const section = sections.find(
      (s) => s.section_name === sectionName && s.page_path === pagePath
    )

    if (!section) {
      return NextResponse.json(
        {
          error: `Section "${sectionName}" not found on page "${pagePath}"`,
        },
        { status: 404 }
      )
    }

    // Fetch current component file
    const currentFile = await getProjectFileByPath(
      projectId,
      section.component_path
    )
    if (!currentFile) {
      return NextResponse.json(
        {
          error: `Component file not found: ${section.component_path}`,
        },
        { status: 404 }
      )
    }

    // Save current content to file_versions (for undo)
    await saveFileVersion(
      projectId,
      section.component_path,
      currentFile.content,
      instruction
    )

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
          sendEvent({
            status: "started",
            section: sectionName,
            componentPath: section.component_path,
          })

          // Run the section edit
          const result = await stepSectionEdit(
            projectId,
            section.component_path,
            instruction,
            currentFile.content
          )

          sendEvent({
            status: "complete",
            componentPath: section.component_path,
            warnings: result.warnings,
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Edit failed"
          sendEvent({ status: "failed", error: message })
          logApiError(error, {
            route: "/api/projects/[id]/sections/edit",
            method: "POST",
            statusCode: 500,
            projectId,
            extra: { sectionName, pagePath },
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
      route: "/api/projects/[id]/sections/edit",
      method: "POST",
      statusCode: 500,
      projectId,
    })
    const message =
      error instanceof Error ? error.message : "Failed to start edit"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
