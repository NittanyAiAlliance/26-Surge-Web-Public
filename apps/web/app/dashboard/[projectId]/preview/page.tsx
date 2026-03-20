import { notFound } from "next/navigation"
import { PreviewShell } from "@/components/preview/preview-shell"

export const dynamic = "force-dynamic"

interface PreviewPageProps {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: PreviewPageProps) {
  const { projectId } = await params
  const { getProject } = await import("@radiant/db")
  const project = await getProject(projectId)
  return {
    title: project ? `Preview: ${project.business_name}` : "Preview",
    description: project
      ? `Preview the generated website for ${project.business_name}.`
      : "Preview your generated website.",
    robots: { index: false, follow: false },
  }
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { projectId } = await params
  const { getProject } = await import("@radiant/db")

  const project = await getProject(projectId)

  if (!project) {
    notFound()
  }

  return (
    <PreviewShell
      projectId={project.id}
      businessName={project.business_name}
      subdomain={project.subdomain}
      status={project.status}
    />
  )
}
