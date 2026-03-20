import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { logApiError } from "../../../../../lib/error-logger"

/**
 * GET /api/projects/[id]/structure
 * Returns the page -> section tree for the editing UI.
 */
export async function GET(
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

    const { getProject, getProjectSections } = await import("@radiant/db")

    // Verify project exists and user owns it
    const project = await getProject(projectId)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Fetch all sections for this project
    const sections = await getProjectSections(projectId)

    // Group sections by page_path
    const pageMap = new Map<
      string,
      Array<{
        name: string
        componentPath: string
        displayOrder: number
      }>
    >()

    for (const section of sections) {
      if (!pageMap.has(section.page_path)) {
        pageMap.set(section.page_path, [])
      }
      pageMap.get(section.page_path)!.push({
        name: section.section_name,
        componentPath: section.component_path,
        displayOrder: section.display_order,
      })
    }

    // Derive page name from path
    const pageNameFromPath = (path: string): string => {
      if (path === "/") return "Home"
      if (path === "/_global") return "Global"
      const segment = path.replace(/^\//, "")
      return segment.charAt(0).toUpperCase() + segment.slice(1)
    }

    // Build ordered page list (Home first, then alphabetical)
    const pages = Array.from(pageMap.entries())
      .sort((a, b) => {
        if (a[0] === "/") return -1
        if (b[0] === "/") return 1
        if (a[0] === "/_global") return 1
        if (b[0] === "/_global") return -1
        return a[0].localeCompare(b[0])
      })
      .map(([path, sects]) => ({
        path,
        name: pageNameFromPath(path),
        sections: sects.sort((a, b) => a.displayOrder - b.displayOrder),
      }))

    return NextResponse.json({ pages })
  } catch (error) {
    logApiError(error, {
      route: "/api/projects/[id]/structure",
      method: "GET",
      statusCode: 500,
      projectId,
    })
    const message =
      error instanceof Error ? error.message : "Failed to fetch structure"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
