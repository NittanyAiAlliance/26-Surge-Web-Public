import { NextRequest, NextResponse } from "next/server"
import { createProject, getUser } from "@radiant/db"
import { logApiError } from "../../../lib/error-logger"
import { createClient } from "@/lib/supabase-server"
import { checkProjectLimit } from "@/lib/plan-limits"
import { findAvailableSubdomain } from "@/lib/subdomain"
import type { PlanKey } from "@/lib/stripe"

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { businessName, projectName, industry } = body as Record<string, unknown>
  const displayName = (businessName || projectName) as string | undefined

  if (!displayName || typeof displayName !== "string") {
    return NextResponse.json(
      { error: "Missing required field: businessName or projectName" },
      { status: 400 },
    )
  }

  // Check auth and plan limits
  let userId = "anonymous"
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser) {
    userId = authUser.id
    const profile = await getUser(authUser.id)
    const plan = (profile?.plan ?? "free") as PlanKey
    const limitCheck = await checkProjectLimit(authUser.id, plan)
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.reason, code: "PLAN_LIMIT_EXCEEDED" },
        { status: 403 },
      )
    }
  }

  const subdomain = await findAvailableSubdomain(displayName)

  try {
    const project = await createProject(userId, displayName, subdomain, {
      industry: typeof industry === "string" ? industry : undefined,
      status: "draft",
    })

    return NextResponse.json({ projectId: project.id, subdomain: project.subdomain })
  } catch (error) {
    logApiError(error, { route: "/api/projects", statusCode: 500, extra: { displayName, subdomain } })
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}
