// ── Types ────────────────────────────────────────────────

export interface VercelFile {
  /** File path relative to project root (e.g. "app/page.tsx") */
  file: string
  /** File content as a string */
  data: string
}

export type FileMap = Record<string, string>

export interface VercelProject {
  id: string
  name: string
  accountId: string
  createdAt: number
  framework: string | null
}

export interface VercelDeployment {
  id: string
  url: string
  readyState: VercelDeploymentState
  createdAt: number
}

export type VercelDeploymentState =
  | "QUEUED"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED"
  | "INITIALIZING"

export interface VercelDomain {
  name: string
  apexName: string
  projectId: string
  verified: boolean
}

export interface DeploymentStatus {
  id: string
  readyState: VercelDeploymentState
  url: string | null
  createdAt: number
  buildingAt: number | null
  ready: number | null
  error: VercelError | null
}

export interface VercelError {
  code: string
  message: string
}

// ── Constants ───────────────────────────────────────────

const VERCEL_API_BASE = "https://api.vercel.com"
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1_000

// ── Internal helpers ────────────────────────────────────

function getToken(): string {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    throw new Error("VERCEL_TOKEN environment variable is not set")
  }
  return token
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

async function vercelFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const url = `${VERCEL_API_BASE}${path}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      )

      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers(token),
          ...(options.headers as Record<string, string>),
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.text()
        let errorMessage: string
        try {
          const parsed = JSON.parse(body)
          errorMessage =
            parsed.error?.message || parsed.message || body
        } catch {
          errorMessage = body
        }
        throw new Error(
          `Vercel API error (${response.status}): ${errorMessage}`
        )
      }

      return (await response.json()) as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on 4xx errors (client errors)
      if (
        lastError.message.includes("(4") &&
        lastError.message.includes("Vercel API error")
      ) {
        throw lastError
      }

      // Don't retry on abort (timeout) for the last attempt
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1))
        )
      }
    }
  }

  throw lastError ?? new Error("Vercel API request failed after retries")
}

/**
 * Convert a FileMap (path → content) into Vercel's InlinedFile format.
 * Each file is base64-encoded as required by the Vercel deployments API.
 */
function fileMapToInlinedFiles(
  files: FileMap
): Array<{ file: string; data: string; encoding: string }> {
  return Object.entries(files).map(([filePath, content]) => ({
    file: filePath,
    data: Buffer.from(content).toString("base64"),
    encoding: "base64",
  }))
}

// ── Public API ──────────────────────────────────────────

/**
 * Create a new Vercel project.
 */
export async function createProject(
  name: string,
  options?: { framework?: string }
): Promise<VercelProject> {
  return vercelFetch<VercelProject>("/v10/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      framework: options?.framework ?? "nextjs",
    }),
  })
}

/**
 * Create a deployment for an existing project.
 * Files should be a map of file paths to content strings.
 */
export async function createDeployment(
  projectId: string,
  files: FileMap
): Promise<VercelDeployment> {
  const inlinedFiles = fileMapToInlinedFiles(files)

  return vercelFetch<VercelDeployment>("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: projectId,
      files: inlinedFiles,
      project: projectId,
      target: "production",
    }),
  })
}

/**
 * Add a custom domain to a Vercel project.
 */
export async function addDomain(
  projectId: string,
  domain: string
): Promise<VercelDomain> {
  return vercelFetch<VercelDomain>(
    `/v10/projects/${encodeURIComponent(projectId)}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    }
  )
}

/**
 * Get the current status of a deployment.
 */
export async function getDeploymentStatus(
  deploymentId: string
): Promise<DeploymentStatus> {
  return vercelFetch<DeploymentStatus>(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`
  )
}

/**
 * Delete a Vercel project and all its deployments.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const token = getToken()
  const url = `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(projectId)}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const response = await fetch(url, {
    method: "DELETE",
    headers: headers(token),
    signal: controller.signal,
  })

  clearTimeout(timeout)

  if (!response.ok && response.status !== 204) {
    const body = await response.text()
    throw new Error(`Vercel API error (${response.status}): ${body}`)
  }
}

// ── Polling helper ──────────────────────────────────────

/**
 * Poll a deployment until it reaches a terminal state (READY or ERROR).
 *
 * @param deploymentId - The deployment to poll
 * @param intervalMs   - Polling interval in milliseconds (default: 3000)
 * @param maxAttempts  - Maximum number of polls before giving up (default: 60)
 * @returns Final deployment status
 */
export async function waitForDeployment(
  deploymentId: string,
  intervalMs = 3_000,
  maxAttempts = 60
): Promise<DeploymentStatus> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getDeploymentStatus(deploymentId)

    if (status.readyState === "READY" || status.readyState === "ERROR" || status.readyState === "CANCELED") {
      return status
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `Deployment ${deploymentId} did not reach a terminal state after ${maxAttempts} attempts`
  )
}

// ── Re-exports for testing ──────────────────────────────

export {
  VERCEL_API_BASE,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  vercelFetch,
  fileMapToInlinedFiles,
  getToken,
}
