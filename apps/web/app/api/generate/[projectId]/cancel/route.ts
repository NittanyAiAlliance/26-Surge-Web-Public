import { NextRequest, NextResponse } from "next/server"
import { getProject, updateProject } from "@radiant/db"
import { inngest } from "@/lib/inngest/client"
import { createClient } from "@/lib/supabase-server"

export async function POST(
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

  // Check ownership — only project owner can cancel
  if (project.user_id && project.user_id !== "anonymous") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== project.user_id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }
  }

  if (project.status !== "generating") {
    return NextResponse.json({ error: "Project is not generating" }, { status: 409 })
  }

  // Send cancellation event to Inngest
  await inngest.send({
    name: "site/generation.cancelled",
    data: { projectId },
  })

  // Immediately mark as failed so polling picks it up
  await updateProject(projectId, {
    status: "failed",
    generation_step: "cancelled",
    generation_percent: null,
  })

  return NextResponse.json({ success: true })
}
