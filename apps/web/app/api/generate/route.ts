import { NextRequest, NextResponse } from "next/server"
import { getProject, updateProject } from "@radiant/db"
import type { BusinessProfile } from "@radiant/scraper"
import type { GenerationMode } from "@/lib/types/generation"
import { checkRateLimit, generateLimiter } from "../../../lib/rate-limit"
import { logApiError } from "../../../lib/error-logger"
import { createClient } from "../../../lib/supabase-server"
import { inngest } from "@/lib/inngest/client"

// Size limits for user-supplied text fields to prevent cost amplification and DB bloat
const MAX_CUSTOM_CONTEXT_LENGTH = 100_000 // 100K chars
const MAX_RESUME_TEXT_LENGTH = 100_000 // 100K chars
const MAX_PROJECT_NAME_LENGTH = 200
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 5_000

function validateBusinessProfile(profile: unknown): profile is BusinessProfile {
  if (!profile || typeof profile !== "object") return false
  const p = profile as Record<string, unknown>
  return (
    typeof p.name === "string" &&
    typeof p.address === "string" &&
    typeof p.city === "string" &&
    typeof p.state === "string" &&
    typeof p.phone === "string" &&
    typeof p.rating === "number" &&
    typeof p.category === "string" &&
    typeof p.industry === "string" &&
    Array.isArray(p.hours) &&
    Array.isArray(p.photos) &&
    Array.isArray(p.reviews)
  )
}

export async function POST(request: NextRequest) {
  // Rate limiting by IP
  const rateLimited = await checkRateLimit(generateLimiter, request, "Maximum 5 generations per hour.")
  if (rateLimited) return rateLimited

  // Parse request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    )
  }

  const { projectId, mode: rawMode, ...rest } = body as Record<string, unknown>
  const mode: GenerationMode = (rawMode === "custom" || rawMode === "portfolio") ? rawMode : "business"

  // Validate projectId
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "Missing required field: projectId (string)" },
      { status: 400 },
    )
  }

  // Validate based on mode
  if (mode === "business") {
    const { businessProfile } = rest
    if (!validateBusinessProfile(businessProfile)) {
      return NextResponse.json(
        { error: "Missing or invalid field: businessProfile" },
        { status: 400 },
      )
    }
  } else if (mode === "custom") {
    const { projectName, customContext, customInstructions } = rest as Record<string, unknown>
    if (!projectName || typeof projectName !== "string") {
      return NextResponse.json({ error: "Missing required field: projectName" }, { status: 400 })
    }
    if (!customContext || typeof customContext !== "string") {
      return NextResponse.json({ error: "Missing required field: customContext" }, { status: 400 })
    }
    // Enforce size limits to prevent cost amplification and DB bloat
    if (projectName.length > MAX_PROJECT_NAME_LENGTH) {
      rest.projectName = projectName.slice(0, MAX_PROJECT_NAME_LENGTH)
    }
    if (customContext.length > MAX_CUSTOM_CONTEXT_LENGTH) {
      rest.customContext = customContext.slice(0, MAX_CUSTOM_CONTEXT_LENGTH)
    }
    if (typeof customInstructions === "string" && customInstructions.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      rest.customInstructions = customInstructions.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH)
    }
  } else if (mode === "portfolio") {
    const { projectName, resumeText, portfolioPreferences } = rest as Record<string, unknown>
    if (!projectName || typeof projectName !== "string") {
      return NextResponse.json({ error: "Missing required field: projectName" }, { status: 400 })
    }
    if (!resumeText || typeof resumeText !== "string") {
      return NextResponse.json({ error: "Missing required field: resumeText" }, { status: 400 })
    }
    // Enforce size limits to prevent cost amplification and DB bloat
    if (projectName.length > MAX_PROJECT_NAME_LENGTH) {
      rest.projectName = projectName.slice(0, MAX_PROJECT_NAME_LENGTH)
    }
    if (resumeText.length > MAX_RESUME_TEXT_LENGTH) {
      rest.resumeText = resumeText.slice(0, MAX_RESUME_TEXT_LENGTH)
    }
    if (typeof portfolioPreferences === "string" && portfolioPreferences.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
      rest.portfolioPreferences = portfolioPreferences.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH)
    }
  }

  // Verify project exists and user owns it
  try {
    const project = await getProject(projectId)
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      )
    }

    // Concurrency guard — prevent duplicate generation
    if (project.status === "generating") {
      return NextResponse.json(
        { error: "Generation already in progress for this project" },
        { status: 409 },
      )
    }

    // Check ownership — only project owner can generate
    if (project.user_id && project.user_id !== "anonymous") {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== project.user_id) {
        return NextResponse.json(
          { error: "Not authorized to generate for this project" },
          { status: 403 },
        )
      }
    }
  } catch (error) {
    logApiError(error, { route: "/api/generate", statusCode: 500, projectId, extra: { phase: "project_verification" } })
    return NextResponse.json(
      { error: "Failed to verify project" },
      { status: 500 },
    )
  }

  // Save context to project config
  try {
    if (mode === "business") {
      await updateProject(projectId, { config: { mode, ...rest.businessProfile as Record<string, unknown> } })
    } else {
      await updateProject(projectId, { config: { mode, ...rest } as Record<string, unknown> })
    }
  } catch {
    // Non-fatal
  }

  // Mark project as generating and queue the Inngest pipeline
  await updateProject(projectId, {
    status: "generating",
    generation_step: "queued",
    generation_percent: 0,
  })

  try {
    await inngest.send({
      name: "site/generation.started",
      data: { projectId, mode, ...(mode === "business" ? { businessProfile: rest.businessProfile } : rest) },
    })
  } catch (error) {
    await updateProject(projectId, {
      status: "failed",
      generation_step: "failed",
      generation_percent: null,
    })

    logApiError(error, {
      route: "/api/generate",
      statusCode: 502,
      projectId,
      extra: { phase: "inngest_send" },
    })

    return NextResponse.json(
      { error: "Failed to queue generation" },
      { status: 502 },
    )
  }

  return NextResponse.json({ projectId }, { status: 202 })
}
