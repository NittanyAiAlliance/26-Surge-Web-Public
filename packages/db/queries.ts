import { getServiceClient } from "./index"
import type {
  User,
  Project,
  ProjectInsert,
  ProjectFile,
  ProjectFileMeta,
  ProjectFileInsert,
  Business,
  BusinessInsert,
  Generation,
  GenerationInsert,
  ErrorLog,
  ProjectSection,
  ProjectSectionInsert,
  FileVersion,
} from "./types"

function db() {
  return getServiceClient()
}

// ── Users ────────────────────────────────────────────────

export async function getUser(userId: string): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .eq("id", userId)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null // Not found
    throw new Error(`getUser failed: ${error.message}`)
  }
  return data as User
}

export async function getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(`getUserByStripeCustomerId failed: ${error.message}`)
  }
  return data as User
}

export async function updateUserStripeInfo(
  userId: string,
  updates: {
    stripe_customer_id?: string
    stripe_subscription_id?: string | null
    subscription_status?: string
    plan?: string
    billing_cycle_start?: string | null
    billing_cycle_end?: string | null
  }
): Promise<User> {
  const { data, error } = await db()
    .from("users")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single()

  if (error) throw new Error(`updateUserStripeInfo failed: ${error.message}`)
  return data as User
}

export async function countUserProjects(userId: string): Promise<number> {
  const { count, error } = await db()
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) throw new Error(`countUserProjects failed: ${error.message}`)
  return count ?? 0
}

export async function countUserGenerationsThisMonth(userId: string): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // First get user's project IDs
  const { data: projects, error: projError } = await db()
    .from("projects")
    .select("id")
    .eq("user_id", userId)

  if (projError) throw new Error(`countUserGenerationsThisMonth failed: ${projError.message}`)
  if (!projects || projects.length === 0) return 0

  const projectIds = projects.map((p: { id: string }) => p.id)

  const { count, error } = await db()
    .from("generations")
    .select("*", { count: "exact", head: true })
    .in("project_id", projectIds)
    .gte("created_at", startOfMonth)
    .eq("status", "completed")

  if (error) throw new Error(`countUserGenerationsThisMonth failed: ${error.message}`)
  return count ?? 0
}

// ── Projects ─────────────────────────────────────────────

export async function createProject(
  userId: string,
  businessName: string,
  subdomain: string,
  opts?: Partial<Pick<ProjectInsert, "industry" | "config" | "status">>
): Promise<Project> {
  const { data, error } = await db()
    .from("projects")
    .insert({
      user_id: userId,
      business_name: businessName,
      subdomain,
      ...opts,
    })
    .select()
    .single()

  if (error) throw new Error(`createProject failed: ${error.message}`)
  return data as Project
}

export async function getProjectsByUser(userId: string): Promise<Project[]> {
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(`getProjectsByUser failed: ${error.message}`)
  return (data ?? []) as Project[]
}

export async function getProject(projectId: string): Promise<Project | null> {
  const { data, error } = await db()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`getProject failed: ${error.message}`)
  }
  return (data as Project) ?? null
}

export async function updateProject(
  projectId: string,
  updates: Partial<ProjectInsert>
): Promise<Project> {
  const { data, error } = await db()
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select()
    .single()

  if (error) throw new Error(`updateProject failed: ${error.message}`)
  return data as Project
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await db()
    .from("projects")
    .delete()
    .eq("id", projectId)

  if (error) throw new Error(`deleteProject failed: ${error.message}`)
}

// ── Project Files ────────────────────────────────────────

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await db()
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("file_path")

  if (error) throw new Error(`getProjectFiles failed: ${error.message}`)
  return (data ?? []) as ProjectFile[]
}

/** Fetch file metadata only (no content) — lightweight for listings */
export async function getProjectFileMetadata(projectId: string): Promise<ProjectFileMeta[]> {
  const { data, error } = await db()
    .from("project_files")
    .select("id, project_id, file_path, file_type, created_at")
    .eq("project_id", projectId)
    .order("file_path")

  if (error) throw new Error(`getProjectFileMetadata failed: ${error.message}`)
  return (data ?? []) as ProjectFileMeta[]
}

/** Fetch a single file by project ID and file path */
export async function getProjectFileByPath(projectId: string, filePath: string): Promise<ProjectFile | null> {
  const { data, error } = await db()
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .eq("file_path", filePath)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`getProjectFileByPath failed: ${error.message}`)
  }
  return (data as ProjectFile) ?? null
}

/** Fetch a single file by its ID */
export async function getProjectFileById(fileId: string): Promise<ProjectFile | null> {
  const { data, error } = await db()
    .from("project_files")
    .select("*")
    .eq("id", fileId)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`getProjectFileById failed: ${error.message}`)
  }
  return (data as ProjectFile) ?? null
}

export async function upsertProjectFiles(
  projectId: string,
  files: Array<Pick<ProjectFileInsert, "file_path" | "content" | "file_type">>
): Promise<ProjectFile[]> {
  const rows = files.map((f) => ({
    project_id: projectId,
    file_path: f.file_path,
    content: f.content,
    file_type: f.file_type ?? null,
  }))

  const { data, error } = await db()
    .from("project_files")
    .upsert(rows, { onConflict: "project_id,file_path" })
    .select()

  if (error) throw new Error(`upsertProjectFiles failed: ${error.message}`)
  return (data ?? []) as ProjectFile[]
}

export async function deleteProjectFiles(projectId: string): Promise<void> {
  const { error } = await db()
    .from("project_files")
    .delete()
    .eq("project_id", projectId)

  if (error) throw new Error(`deleteProjectFiles failed: ${error.message}`)
}

// ── Businesses ───────────────────────────────────────────

export async function upsertBusiness(
  googlePlaceId: string,
  data: Omit<BusinessInsert, "google_place_id">
): Promise<Business> {
  const { data: result, error } = await db()
    .from("businesses")
    .upsert(
      { google_place_id: googlePlaceId, ...data, updated_at: new Date().toISOString() },
      { onConflict: "google_place_id" }
    )
    .select()
    .single()

  if (error) throw new Error(`upsertBusiness failed: ${error.message}`)
  return result as Business
}

export async function getBusinessByPlaceId(googlePlaceId: string): Promise<Business | null> {
  const { data, error } = await db()
    .from("businesses")
    .select("*")
    .eq("google_place_id", googlePlaceId)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`getBusinessByPlaceId failed: ${error.message}`)
  }
  return (data as Business) ?? null
}

/**
 * Get a cached business only if updated within the given TTL (default 24 hours).
 * Returns null if the business is not cached or the cache is stale.
 */
export async function getFreshBusiness(
  googlePlaceId: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<Business | null> {
  const business = await getBusinessByPlaceId(googlePlaceId)
  if (!business) return null

  const updatedAt = new Date(business.updated_at).getTime()
  const age = Date.now() - updatedAt
  if (age > ttlMs) return null

  return business
}

// ── Generations ──────────────────────────────────────────

export async function logGeneration(
  projectId: string,
  prompt: { system_prompt?: string; user_prompt?: string; prompt_hash?: string },
  response: string | null,
  stats: { tokens_input?: number; tokens_output?: number; duration_ms?: number; model?: string; status?: "pending" | "running" | "completed" | "failed"; error?: string; generation_step?: "design_director" | "scaffold" | "homepage" | "page" | "full" }
): Promise<Generation> {
  const { data, error } = await db()
    .from("generations")
    .insert({
      project_id: projectId,
      system_prompt: prompt.system_prompt ?? null,
      user_prompt: prompt.user_prompt ?? null,
      prompt_hash: prompt.prompt_hash ?? null,
      response,
      tokens_input: stats.tokens_input ?? null,
      tokens_output: stats.tokens_output ?? null,
      duration_ms: stats.duration_ms ?? null,
      model: stats.model ?? null,
      status: stats.status ?? "completed",
      error: stats.error ?? null,
      generation_step: stats.generation_step ?? "full",
    })
    .select()
    .single()

  if (error) throw new Error(`logGeneration failed: ${error.message}`)
  return data as Generation
}

export async function getGenerationsByProject(projectId: string): Promise<Generation[]> {
  const { data, error } = await db()
    .from("generations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(`getGenerationsByProject failed: ${error.message}`)
  return (data ?? []) as Generation[]
}

// ── Error Logs ──────────────────────────────────────────

export async function logError(entry: {
  route: string
  method?: string
  status_code?: number
  error_message: string
  error_code?: string
  stack_trace?: string
  request_context?: Record<string, unknown>
  user_id?: string
  project_id?: string
}): Promise<ErrorLog> {
  const { data, error } = await db()
    .from("error_logs")
    .insert({
      route: entry.route,
      method: entry.method ?? "POST",
      status_code: entry.status_code ?? 500,
      error_message: entry.error_message,
      error_code: entry.error_code ?? null,
      stack_trace: entry.stack_trace ?? null,
      request_context: entry.request_context ?? {},
      user_id: entry.user_id ?? null,
      project_id: entry.project_id ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`logError failed: ${error.message}`)
  return data as ErrorLog
}

export async function getRecentErrors(limit = 50): Promise<ErrorLog[]> {
  const { data, error } = await db()
    .from("error_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getRecentErrors failed: ${error.message}`)
  return (data ?? []) as ErrorLog[]
}

// ── Project Sections ─────────────────────────────────────

export async function getProjectSections(projectId: string): Promise<ProjectSection[]> {
  const { data, error } = await db()
    .from("project_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("page_path")
    .order("display_order")

  if (error) throw new Error(`getProjectSections failed: ${error.message}`)
  return (data ?? []) as ProjectSection[]
}

export async function upsertProjectSections(
  projectId: string,
  sections: Omit<ProjectSectionInsert, "project_id">[]
): Promise<void> {
  if (sections.length === 0) return

  const rows = sections.map((s) => ({
    project_id: projectId,
    page_path: s.page_path,
    section_name: s.section_name,
    component_path: s.component_path,
    display_order: s.display_order,
  }))

  const { error } = await db()
    .from("project_sections")
    .upsert(rows, { onConflict: "project_id,page_path,section_name" })

  if (error) throw new Error(`upsertProjectSections failed: ${error.message}`)
}

export async function deleteProjectSections(projectId: string): Promise<void> {
  const { error } = await db()
    .from("project_sections")
    .delete()
    .eq("project_id", projectId)

  if (error) throw new Error(`deleteProjectSections failed: ${error.message}`)
}

// ── File Versions ────────────────────────────────────────

export async function saveFileVersion(
  projectId: string,
  filePath: string,
  content: string,
  editInstruction?: string
): Promise<FileVersion> {
  // Get the next version number
  const { data: latest } = await db()
    .from("file_versions")
    .select("version")
    .eq("project_id", projectId)
    .eq("file_path", filePath)
    .order("version", { ascending: false })
    .limit(1)
    .single()

  const nextVersion = (latest?.version ?? 0) + 1

  const { data, error } = await db()
    .from("file_versions")
    .insert({
      project_id: projectId,
      file_path: filePath,
      content,
      edit_instruction: editInstruction ?? null,
      version: nextVersion,
    })
    .select()
    .single()

  if (error) throw new Error(`saveFileVersion failed: ${error.message}`)
  return data as FileVersion
}

export async function getFileVersions(
  projectId: string,
  filePath: string
): Promise<FileVersion[]> {
  const { data, error } = await db()
    .from("file_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq("file_path", filePath)
    .order("version", { ascending: false })

  if (error) throw new Error(`getFileVersions failed: ${error.message}`)
  return (data ?? []) as FileVersion[]
}

export async function getLatestFileVersion(
  projectId: string,
  filePath: string
): Promise<FileVersion | null> {
  const { data, error } = await db()
    .from("file_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq("file_path", filePath)
    .order("version", { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== "PGRST116") {
    throw new Error(`getLatestFileVersion failed: ${error.message}`)
  }
  return (data as FileVersion) ?? null
}

