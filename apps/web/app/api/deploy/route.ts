export const maxDuration = 300

import { NextRequest, NextResponse } from "next/server"
import { getProject, getUser } from "@radiant/db"
import { deployProject, DeploymentError } from "../../../lib/deployer"
import { checkRateLimit, deployLimiter } from "../../../lib/rate-limit"
import { sendSiteLiveEmail } from "../../../lib/email"
import { logApiError } from "../../../lib/error-logger"
import { sanitizeErrorMessage } from "../../../lib/sanitize-error"
import { createClient } from "../../../lib/supabase-server"

/** Send deployment success email (fire-and-forget). */
async function notifyDeploymentSuccess(projectId: string, siteUrl: string) {
  try {
    const project = await getProject(projectId)
    if (!project?.user_id) return
    const user = await getUser(project.user_id)
    if (!user?.email) return
    await sendSiteLiveEmail(user.email, project.business_name, siteUrl)
  } catch {
    // Email failure should never affect deployment response
  }
}

/** Map DeploymentError codes to HTTP status codes */
function deploymentErrorToStatus(code: string): number {
  switch (code) {
    case "PROJECT_NOT_FOUND":
      return 404
    case "NO_FILES":
      return 400
    case "ALREADY_DEPLOYING":
      return 409
    case "QUOTA_EXCEEDED":
      return 429
    case "DOMAIN_CONFLICT":
    case "VERCEL_PROJECT_FAILED":
    case "DEPLOYMENT_FAILED":
    case "BUILD_FAILED":
    case "TIMEOUT":
      return 502
    default:
      return 500
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting by IP
  const rateLimited = await checkRateLimit(deployLimiter, request, "Maximum 10 deployments per hour.")
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

  const { projectId } = body as Record<string, unknown>

  // Validate projectId
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "Missing required field: projectId (string)" },
      { status: 400 },
    )
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

    // Check ownership — only project owner can deploy
    if (project.user_id && project.user_id !== "anonymous") {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== project.user_id) {
        return NextResponse.json(
          { error: "Not authorized to deploy this project" },
          { status: 403 },
        )
      }
    }
  } catch (error) {
    logApiError(error, { route: "/api/deploy", statusCode: 500, projectId: projectId as string, extra: { phase: "project_verification" } })
    return NextResponse.json(
      { error: "Failed to verify project" },
      { status: 500 },
    )
  }

  // Check if client wants SSE streaming
  const acceptHeader = request.headers.get("accept") ?? ""
  const wantsStream = acceptHeader.includes("text/event-stream")

  if (wantsStream) {
    // SSE streaming mode — real-time deployment progress
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        let done = false

        function sendEvent(event: string, data: unknown) {
          if (!done) {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            )
          }
        }

        // Send keepalive pings every 15s to prevent connection timeout
        const keepalive = setInterval(() => {
          if (!done) {
            controller.enqueue(encoder.encode(": keepalive\n\n"))
          }
        }, 15000)

        sendEvent("progress", {
          step: "starting",
          message: "Starting deployment...",
        })

        deployProject(projectId as string)
          .then((result) => {
            clearInterval(keepalive)
            sendEvent("complete", {
              success: true,
              url: result.url,
              vercelUrl: result.vercelUrl,
              customDomain: result.customDomain,
              deploymentId: result.deploymentId,
              status: result.status,
            })
            done = true
            controller.close()
            // Fire-and-forget email
            notifyDeploymentSuccess(projectId as string, result.url)
          })
          .catch((error) => {
            clearInterval(keepalive)
            const errorCode = error instanceof DeploymentError ? error.code : undefined
            const { message: safeMessage } = sanitizeErrorMessage(error)
            sendEvent("error", {
              success: false,
              error: safeMessage,
              code: errorCode,
            })
            done = true
            logApiError(error, { route: "/api/deploy", statusCode: errorCode ? deploymentErrorToStatus(errorCode) : 500, projectId: projectId as string, errorCode, extra: { phase: "deployment", streaming: true } })
            controller.close()
          })
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  // Non-streaming mode — wait for deployment to complete and return result
  try {
    const result = await deployProject(projectId)

    // Fire-and-forget email
    notifyDeploymentSuccess(projectId, result.url)

    return NextResponse.json({
      success: true,
      url: result.url,
      vercelUrl: result.vercelUrl,
      customDomain: result.customDomain,
      deploymentId: result.deploymentId,
      status: result.status,
    })
  } catch (error) {
    const errorCode = error instanceof DeploymentError ? error.code : undefined
    const { message: safeMessage, status: safeStatus } = sanitizeErrorMessage(error)
    const status = errorCode ? deploymentErrorToStatus(errorCode) : safeStatus

    logApiError(error, { route: "/api/deploy", statusCode: status, projectId, errorCode, extra: { phase: "deployment" } })
    return NextResponse.json(
      { success: false, error: safeMessage, code: errorCode },
      { status },
    )
  }
}
