import { NextRequest, NextResponse } from "next/server"
import { getProject } from "@radiant/db"
import { createClient } from "@/lib/supabase-server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
  }

  const project = await getProject(projectId)
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // Check ownership — only project owner can view status
  if (project.user_id && project.user_id !== "anonymous") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== project.user_id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }
  }

  return NextResponse.json({
    status: project.status,
    step: project.generation_step ?? null,
    percent: project.generation_percent ?? 0,
    startedAt: project.updated_at,
  })
}
