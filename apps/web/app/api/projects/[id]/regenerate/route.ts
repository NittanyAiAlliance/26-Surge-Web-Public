import { NextRequest, NextResponse } from "next/server"
import { getProject, updateProject } from "@radiant/db"
import type { BusinessProfile } from "@radiant/scraper"
import { inngest } from "@/lib/inngest/client"
import { checkRateLimit, regenerateLimiter } from "../../../../../lib/rate-limit"
import { logApiError } from "../../../../../lib/error-logger"
import { createClient } from "../../../../../lib/supabase-server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  let mode: "full" | "partial" = "full"
  let customInstructions: string | undefined

  // Rate limiting by IP
  const rateLimited = await checkRateLimit(regenerateLimiter, request, "Maximum 5 regenerations per hour.")
  if (rateLimited) return rateLimited

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (body.mode === "partial" || body.mode === "full") {
      mode = body.mode
    }
    if (typeof body.customInstructions === "string" && body.customInstructions.trim()) {
      // Cap at 2000 chars to prevent prompt injection / cost amplification
      const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 2000
      const trimmed = body.customInstructions.trim()
      customInstructions = trimmed.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH)
    }
  } catch {
    // Body is optional for full regeneration
  }

  // Verify project exists, user owns it, and fetch config
  let project
  try {
    project = await getProject(projectId)
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      )
    }

    // Check ownership — only project owner can regenerate
    if (project.user_id && project.user_id !== "anonymous") {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== project.user_id) {
        return NextResponse.json(
          { error: "Not authorized to regenerate this project" },
          { status: 403 },
        )
      }
    }
  } catch (error) {
    logApiError(error, { route: "/api/projects/[id]/regenerate", statusCode: 500, projectId, extra: { phase: "project_verification" } })
    return NextResponse.json(
      { error: "Failed to verify project" },
      { status: 500 },
    )
  }

  // Determine project mode from config
  const config = project.config as Record<string, unknown>
  const projectMode = (config.mode as string) ?? "business"

  // Mode-based validation
  let businessProfile: BusinessProfile | undefined

  if (projectMode === "business") {
    // Extract only BusinessProfile fields — config may also contain designBrief
    // or other merged data from generation, so we must not pass the whole object.
    businessProfile = {
      name: config.name as string,
      address: config.address as string,
      city: config.city as string,
      state: config.state as string,
      phone: config.phone as string,
      website: config.website as string | undefined,
      rating: config.rating as number,
      reviewCount: config.reviewCount as number,
      category: config.category as string,
      industry: config.industry as string,
      hours: (config.hours as BusinessProfile["hours"]) ?? [],
      photos: (config.photos as BusinessProfile["photos"]) ?? [],
      reviews: (config.reviews as BusinessProfile["reviews"]) ?? [],
      location: config.location as BusinessProfile["location"],
      existingContent: config.existingContent as BusinessProfile["existingContent"],
    }

    if (!businessProfile.name || !businessProfile.address || !businessProfile.category) {
      return NextResponse.json(
        { success: false, error: "Invalid project configuration — missing required business data" },
        { status: 400 },
      )
    }
  } else if (projectMode === "custom") {
    if (!config.customContext) {
      return NextResponse.json(
        { success: false, error: "Invalid project configuration — missing custom context" },
        { status: 400 },
      )
    }
  } else if (projectMode === "portfolio") {
    if (!config.resumeText) {
      return NextResponse.json(
        { success: false, error: "Invalid project configuration — missing resume text" },
        { status: 400 },
      )
    }
  }

  // Set status to generating before firing Inngest event
  await updateProject(projectId, {
    status: "generating",
    generation_step: "queued",
    generation_percent: 0,
  })

  try {
    await inngest.send({
      name: "site/generation.started",
      data: {
        projectId,
        mode: projectMode,
        ...(projectMode === "business" ? { businessProfile } : {}),
        customInstructions: mode === "partial" ? customInstructions : undefined,
      },
    })
  } catch (error) {
    await updateProject(projectId, {
      status: "failed",
      generation_step: "failed",
      generation_percent: null,
    })

    logApiError(error, {
      route: "/api/projects/[id]/regenerate",
      statusCode: 502,
      projectId,
      extra: { phase: "inngest_send", mode },
    })

    return NextResponse.json(
      { error: "Failed to queue regeneration" },
      { status: 502 },
    )
  }

  return NextResponse.json({ projectId }, { status: 202 })
}
