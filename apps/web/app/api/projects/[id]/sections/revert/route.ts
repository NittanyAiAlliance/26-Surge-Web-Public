import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { checkRateLimit, regenerateLimiter } from "../../../../../../lib/rate-limit"
import { logApiError } from "../../../../../../lib/error-logger"

/**
 * POST /api/projects/[id]/sections/revert
 * Reverts a component to its previous version (undo last edit).
 * Body: { componentPath: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params

  // Rate limiting (shares the regenerate limiter — 5 req/hr)
  const rateLimited = await checkRateLimit(
    regenerateLimiter,
    request,
    "Maximum 5 edits/reverts per hour."
  )
  if (rateLimited) return rateLimited

  try {
    // Auth check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Parse body
    const body = (await request.json()) as { componentPath?: string }
    if (!body.componentPath || typeof body.componentPath !== "string") {
      return NextResponse.json(
        { error: "componentPath is required" },
        { status: 400 }
      )
    }

    const componentPath = body.componentPath.trim()

    // Valid paths: components/*.tsx, tailwind.config.ts, app/globals.css, app/layout.tsx
    const validPrefixes = ["components/", "app/", "tailwind.config.ts"]
    const isValidPath = validPrefixes.some((p) => componentPath.startsWith(p))
    if (
      componentPath.length > 200 ||
      componentPath.includes("..") ||
      !isValidPath
    ) {
      return NextResponse.json(
        { error: "Invalid component path" },
        { status: 400 }
      )
    }

    // Verify project ownership
    const { getProject, getLatestFileVersion, upsertProjectFiles, getServiceClient } =
      await import("@radiant/db")

    const project = await getProject(projectId)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    // Can't revert while generating or mid-edit
    if (project.status === "generating") {
      return NextResponse.json(
        { error: "Cannot revert while generating" },
        { status: 409 }
      )
    }
    if (project.generation_step === "editing") {
      return NextResponse.json(
        { error: "Cannot revert while an edit is in progress" },
        { status: 409 }
      )
    }

    // Get the latest saved version
    const latestVersion = await getLatestFileVersion(projectId, componentPath)
    if (!latestVersion) {
      return NextResponse.json(
        { error: "No previous version found — nothing to revert" },
        { status: 404 }
      )
    }

    // Restore the file content
    await upsertProjectFiles(projectId, [
      {
        file_path: componentPath,
        content: latestVersion.content,
        file_type: componentPath.endsWith(".tsx")
          ? "tsx"
          : componentPath.endsWith(".ts")
            ? "ts"
            : componentPath.endsWith(".css")
              ? "css"
              : null,
      },
    ])

    // Delete the used version row so next revert gets the version before this one
    const db = getServiceClient()
    await db.from("file_versions").delete().eq("id", latestVersion.id)

    return NextResponse.json({
      success: true,
      componentPath,
      restoredVersion: latestVersion.version,
    })
  } catch (error) {
    logApiError(error, {
      route: "/api/projects/[id]/sections/revert",
      method: "POST",
      statusCode: 500,
      projectId,
    })
    const message =
      error instanceof Error ? error.message : "Failed to revert"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
