import {
  getProject,
  getProjectFiles,
  updateProject,
} from "@radiant/db"
import type { Project } from "@radiant/db"
import {
  createProject as createVercelProject,
  createDeployment,
  addDomain,
  waitForDeployment,
} from "./vercel"
import type { DeploymentStatus } from "./vercel"
import { prepareDeployment, detectAnimatedDependencies } from "./deploy-prep"

// ── Types ────────────────────────────────────────────────

export interface DeploymentResult {
  /** The live URL where the site is accessible */
  url: string
  /** The Vercel deployment URL (e.g. my-site-xyz.vercel.app) */
  vercelUrl: string
  /** Custom domain (e.g. my-biz.surgeweb.site) */
  customDomain: string
  /** Vercel project ID */
  vercelProjectId: string
  /** Vercel deployment ID */
  deploymentId: string
  /** Final deployment status */
  status: "deployed" | "failed"
}

export class DeploymentError extends Error {
  constructor(
    message: string,
    public readonly code: DeploymentErrorCode,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = "DeploymentError"
  }
}

export type DeploymentErrorCode =
  | "PROJECT_NOT_FOUND"
  | "NO_FILES"
  | "ALREADY_DEPLOYING"
  | "VERCEL_PROJECT_FAILED"
  | "DEPLOYMENT_FAILED"
  | "DOMAIN_CONFLICT"
  | "QUOTA_EXCEEDED"
  | "BUILD_FAILED"
  | "TIMEOUT"
  | "UNKNOWN"

// ── Constants ───────────────────────────────────────────

const BASE_DOMAIN = process.env.DOMAIN || "surgeweb.site"
const POLL_INTERVAL_MS = 3_000
const MAX_POLL_ATTEMPTS = 60

// ── Helpers ─────────────────────────────────────────────

/**
 * Generate a subdomain-safe custom domain for the project.
 */
export function buildCustomDomain(subdomain: string): string {
  return `${subdomain}.${BASE_DOMAIN}`
}

/**
 * Classify a Vercel API error into a DeploymentErrorCode.
 */
function classifyError(error: unknown): DeploymentErrorCode {
  const msg = error instanceof Error ? error.message : String(error)

  if (msg.includes("quota") || msg.includes("limit")) return "QUOTA_EXCEEDED"
  if (msg.includes("domain") && msg.includes("already")) return "DOMAIN_CONFLICT"
  if (msg.includes("not reach a terminal state")) return "TIMEOUT"
  if (msg.includes("BUILD_FAILED") || msg.includes("Build failed")) return "BUILD_FAILED"
  return "UNKNOWN"
}

// ── Main orchestrator ───────────────────────────────────

/**
 * Deploy a project to Vercel.
 *
 * Steps:
 * 1. Fetch project from database and validate
 * 2. Fetch project files from database
 * 3. Prepare file tree (add configs, dependencies)
 * 4. Create Vercel project (if not exists)
 * 5. Create deployment with all files
 * 6. Add custom domain: [subdomain].surgeweb.site
 * 7. Wait for deployment to be ready (poll status)
 * 8. Update project record with Vercel URL and status
 * 9. Return live URL
 */
export async function deployProject(
  projectId: string
): Promise<DeploymentResult> {
  // 1. Fetch project and validate
  const project = await getProject(projectId)
  if (!project) {
    throw new DeploymentError(
      `Project ${projectId} not found`,
      "PROJECT_NOT_FOUND"
    )
  }

  if (project.status === "generating") {
    throw new DeploymentError(
      `Project ${projectId} is currently generating — wait until generation completes`,
      "ALREADY_DEPLOYING"
    )
  }

  // 2. Fetch project files
  const projectFiles = await getProjectFiles(projectId)
  if (projectFiles.length === 0) {
    throw new DeploymentError(
      `Project ${projectId} has no files to deploy`,
      "NO_FILES"
    )
  }

  // Mark project as deploying
  await updateProject(projectId, { status: "generating" })

  try {
    // 3. Prepare file tree — detect animated component dependencies from generated code
    const mappedFiles = projectFiles.map((f) => ({ file_path: f.file_path, content: f.content }))
    const animatedDeps = detectAnimatedDependencies(mappedFiles)

    // Merge any dependencies declared in the project config (e.g. from design brief)
    const configDeps = (
      project.config &&
      typeof project.config === "object" &&
      project.config.dependencies &&
      typeof project.config.dependencies === "object"
    )
      ? (project.config.dependencies as Record<string, string>)
      : {}

    const additionalDependencies = { ...animatedDeps, ...configDeps }

    const prepared = prepareDeployment(mappedFiles, {
      additionalDependencies: Object.keys(additionalDependencies).length > 0
        ? additionalDependencies
        : undefined,
    })

    // 4. Create Vercel project (if not exists)
    let vercelProjectId = project.vercel_project_id
    if (!vercelProjectId) {
      const vercelProject = await createVercelProject(project.subdomain, {
        framework: "nextjs",
      })
      vercelProjectId = vercelProject.id

      await updateProject(projectId, {
        vercel_project_id: vercelProjectId,
      })
    }

    // 5. Create deployment
    const deployment = await createDeployment(vercelProjectId, prepared.files)

    // 6. Add custom domain
    const customDomain = buildCustomDomain(project.subdomain)
    try {
      await addDomain(vercelProjectId, customDomain)
    } catch (domainError) {
      // Domain may already be added from a previous deployment — that's OK
      const msg =
        domainError instanceof Error ? domainError.message : String(domainError)
      if (!msg.includes("already") && !msg.includes("409")) {
        throw new DeploymentError(
          `Failed to add domain ${customDomain}: ${msg}`,
          "DOMAIN_CONFLICT",
          domainError
        )
      }
    }

    // 7. Wait for deployment to be ready
    const finalStatus: DeploymentStatus = await waitForDeployment(
      deployment.id,
      POLL_INTERVAL_MS,
      MAX_POLL_ATTEMPTS
    )

    // 8. Handle final status
    if (finalStatus.readyState === "ERROR" || finalStatus.readyState === "CANCELED") {
      const errorMsg =
        finalStatus.error?.message ?? "Deployment failed with no error message"

      await updateProject(projectId, {
        status: "failed",
      })

      throw new DeploymentError(
        `Deployment failed: ${errorMsg}`,
        finalStatus.error?.code === "BUILD_FAILED"
          ? "BUILD_FAILED"
          : "DEPLOYMENT_FAILED",
        finalStatus.error
      )
    }

    // 9. Update project record with deployment URL
    const vercelUrl = finalStatus.url ?? deployment.url
    const liveUrl = `https://${customDomain}`

    await updateProject(projectId, {
      status: "deployed",
      vercel_deployment_url: vercelUrl,
    })

    return {
      url: liveUrl,
      vercelUrl,
      customDomain,
      vercelProjectId,
      deploymentId: deployment.id,
      status: "deployed",
    }
  } catch (error) {
    // If it's already a DeploymentError, re-throw
    if (error instanceof DeploymentError) {
      throw error
    }

    // Classify and wrap unknown errors
    const code = classifyError(error)
    const msg = error instanceof Error ? error.message : String(error)

    await updateProject(projectId, { status: "failed" }).catch(() => {
      // Best-effort status update — don't mask the original error
    })

    throw new DeploymentError(
      `Deployment failed: ${msg}`,
      code,
      error
    )
  }
}
