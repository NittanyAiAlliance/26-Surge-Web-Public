import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { logApiError } from "../../../../lib/error-logger"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { getProject, deleteProject } = await import("@radiant/db")

    // Verify project exists and user owns it
    const project = await getProject(projectId)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Delete Vercel project if it exists
    if (project.vercel_project_id) {
      try {
        const { deleteProject: deleteVercelProject } = await import(
          "@/lib/vercel"
        )
        await deleteVercelProject(project.vercel_project_id)
      } catch (err) {
        // Log but don't block deletion if Vercel cleanup fails
        logApiError(err, { route: "/api/projects/[id]", method: "DELETE", statusCode: 500, projectId, errorCode: "VERCEL_CLEANUP_FAILED", extra: { vercelProjectId: project.vercel_project_id } })
      }
    }

    // Delete project from database (cascades to project_files and generations)
    await deleteProject(projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    logApiError(error, { route: "/api/projects/[id]", method: "DELETE", statusCode: 500, projectId })
    const message =
      error instanceof Error ? error.message : "Failed to delete project"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
