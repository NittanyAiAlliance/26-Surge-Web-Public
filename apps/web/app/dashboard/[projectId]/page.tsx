import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { ProjectDetail } from "@/components/dashboard/project-detail"
import type { Project, ProjectFileMeta } from "@radiant/db"

export const dynamic = "force-dynamic"

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: ProjectDetailPageProps) {
  const { projectId } = await params
  const { getProject } = await import("@radiant/db")
  const project = await getProject(projectId)
  return {
    title: project ? project.business_name : "Project",
    description: project
      ? `Manage the generated website for ${project.business_name}.`
      : "Manage your generated website.",
  }
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/dashboard")
  }

  const { getProject, getProjectFileMetadata } = await import("@radiant/db")

  const project = await getProject(projectId)

  if (!project) {
    notFound()
  }

  // Ensure user owns this project
  if (project.user_id !== user.id) {
    notFound()
  }

  // Only fetch metadata (no content) — content is loaded on demand in FilesTab
  const files = await getProjectFileMetadata(projectId)

  return (
    <ProjectDetail
      project={project as Project}
      files={files as ProjectFileMeta[]}
    />
  )
}
