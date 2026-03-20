import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase-server"
import { PageHeader } from "@/components/layout/page-header"
import { ProjectsGrid } from "@/components/dashboard/projects-grid"
import type { Project } from "@radiant/db"

export const metadata = {
  title: "Dashboard",
  description: "Manage your generated websites.",
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/dashboard")
  }

  // Fetch user's projects ordered by most recent
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  const userProjects: Project[] = error ? [] : (projects as Project[]) ?? []

  const subtitle =
    userProjects.length === 0
      ? "Get started by generating your first website"
      : `${userProjects.length} site${userProjects.length === 1 ? "" : "s"} generated`

  const newSiteButton = userProjects.length > 0 ? (
    <Link
      href="/dashboard/create"
      className="group relative inline-flex items-center gap-2 overflow-hidden border border-[var(--dash-vermillion)] px-6 py-2.5 text-sm font-semibold text-white transition-colors"
      style={{ borderRadius: "10px" }}
    >
      <span className="absolute inset-0 -translate-x-full bg-[var(--dash-vermillion)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0" />
      <span className="relative flex items-center gap-2"><Plus className="h-4 w-4" /> New Site</span>
    </Link>
  ) : undefined

  return (
    <div>
      <PageHeader
        title="Your Sites"
        subtitle={subtitle}
        actions={newSiteButton}
      />

      {/* Projects grid */}
      <ProjectsGrid projects={userProjects} />
    </div>
  )
}
