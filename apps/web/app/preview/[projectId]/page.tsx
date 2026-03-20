import { redirect } from "next/navigation"

export default async function PreviewRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  redirect(`/dashboard/${projectId}/preview`)
}
