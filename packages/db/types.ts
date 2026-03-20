// TypeScript types for all Radiant Web database tables
// Generated from packages/db/schema.sql

export type UserPlan = "free" | "pro" | "agency";

export type ProjectStatus =
  | "draft"
  | "generating"
  | "preview"
  | "deployed"
  | "failed";

export type GenerationStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

// ── Core Tables ──────────────────────────────────────────

export type SubscriptionStatus = "none" | "active" | "past_due" | "canceled" | "trialing";

export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: UserPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  business_name: string;
  subdomain: string;
  status: ProjectStatus;
  industry: string | null;
  config: Record<string, unknown>;
  vercel_project_id: string | null;
  vercel_deployment_url: string | null;
  generation_step: string | null;
  generation_percent: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_path: string;
  content: string;
  file_type: string | null;
  created_at: string;
}

/** Lightweight version of ProjectFile without the content column */
export type ProjectFileMeta = Omit<ProjectFile, "content">;

export type GenerationStep = "design_director" | "scaffold" | "homepage" | "page" | "full";

export interface Generation {
  id: string;
  project_id: string;
  prompt_hash: string | null;
  system_prompt: string | null;
  user_prompt: string | null;
  response: string | null;
  model: string;
  tokens_input: number | null;
  tokens_output: number | null;
  duration_ms: number | null;
  status: GenerationStatus;
  error: string | null;
  generation_step: GenerationStep;
  created_at: string;
}

export interface Business {
  id: string;
  google_place_id: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  hours: Record<string, unknown> | null;
  photos: Record<string, unknown> | null;
  reviews: Record<string, unknown> | null;
  scraped_content: Record<string, unknown> | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Error Logs ───────────────────────────────────────────

export interface ErrorLog {
  id: string;
  route: string;
  method: string;
  status_code: number;
  error_message: string;
  error_code: string | null;
  stack_trace: string | null;
  request_context: Record<string, unknown>;
  user_id: string | null;
  project_id: string | null;
  created_at: string;
}

// ── Section Editing ──────────────────────────────────────

export interface ProjectSection {
  id: string;
  project_id: string;
  page_path: string;
  section_name: string;
  component_path: string;
  display_order: number;
  created_at: string;
}

export interface FileVersion {
  id: string;
  project_id: string;
  file_path: string;
  content: string;
  edit_instruction: string | null;
  version: number;
  created_at: string;
}

// ── Vector/Embedding Tables ──────────────────────────────

export interface ComponentEmbedding {
  id: string;
  library: string;
  component_name: string;
  description: string | null;
  docs_text: string;
  code_example: string | null;
  tags: string[] | null;
  embedding: number[] | null;
  created_at: string;
}

export interface TemplateEmbedding {
  id: string;
  industry: string;
  section_type: string;
  description: string | null;
  template_json: Record<string, unknown>;
  embedding: number[] | null;
  created_at: string;
}

export interface PatternEmbedding {
  id: string;
  pattern_type: string;
  name: string;
  description: string | null;
  example_json: Record<string, unknown> | null;
  embedding: number[] | null;
  created_at: string;
}

// ── Insert types (omit auto-generated fields) ───────────

export type UserInsert = Omit<User, "id" | "created_at" | "updated_at"> & {
  id?: string;
  plan?: UserPlan;
  created_at?: string;
  updated_at?: string;
};

export type ProjectInsert = Omit<Project, "id" | "created_at" | "updated_at" | "status" | "config" | "generation_step" | "generation_percent"> & {
  id?: string;
  status?: ProjectStatus;
  config?: Record<string, unknown>;
  generation_step?: string | null;
  generation_percent?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectFileInsert = Omit<ProjectFile, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type GenerationInsert = Omit<Generation, "id" | "created_at" | "model" | "status" | "generation_step"> & {
  id?: string;
  model?: string;
  status?: GenerationStatus;
  generation_step?: GenerationStep;
  created_at?: string;
};

export type BusinessInsert = Omit<Business, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ErrorLogInsert = Omit<ErrorLog, "id" | "created_at" | "method" | "status_code" | "request_context"> & {
  id?: string;
  method?: string;
  status_code?: number;
  request_context?: Record<string, unknown>;
  created_at?: string;
};

export type ComponentEmbeddingInsert = Omit<ComponentEmbedding, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type TemplateEmbeddingInsert = Omit<TemplateEmbedding, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type PatternEmbeddingInsert = Omit<PatternEmbedding, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type ProjectSectionInsert = Omit<ProjectSection, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type FileVersionInsert = Omit<FileVersion, "id" | "created_at" | "version"> & {
  id?: string;
  version?: number;
  created_at?: string;
};

// ── Supabase Database type (for createClient<Database>) ─

export interface Database {
  public: {
    Tables: {
      users: { Row: User; Insert: UserInsert; Update: Partial<UserInsert> };
      projects: { Row: Project; Insert: ProjectInsert; Update: Partial<ProjectInsert> };
      project_files: { Row: ProjectFile; Insert: ProjectFileInsert; Update: Partial<ProjectFileInsert> };
      generations: { Row: Generation; Insert: GenerationInsert; Update: Partial<GenerationInsert> };
      businesses: { Row: Business; Insert: BusinessInsert; Update: Partial<BusinessInsert> };
      component_embeddings: { Row: ComponentEmbedding; Insert: ComponentEmbeddingInsert; Update: Partial<ComponentEmbeddingInsert> };
      template_embeddings: { Row: TemplateEmbedding; Insert: TemplateEmbeddingInsert; Update: Partial<TemplateEmbeddingInsert> };
      pattern_embeddings: { Row: PatternEmbedding; Insert: PatternEmbeddingInsert; Update: Partial<PatternEmbeddingInsert> };
      error_logs: { Row: ErrorLog; Insert: ErrorLogInsert; Update: Partial<ErrorLogInsert> };
      project_sections: { Row: ProjectSection; Insert: ProjectSectionInsert; Update: Partial<ProjectSectionInsert> };
      file_versions: { Row: FileVersion; Insert: FileVersionInsert; Update: Partial<FileVersionInsert> };
    };
    Functions: {
      match_components: {
        Args: { query_embedding: number[]; match_threshold?: number; match_count?: number };
        Returns: Array<{ id: string; library: string; component_name: string; description: string | null; docs_text: string; code_example: string | null; similarity: number }>;
      };
      match_templates: {
        Args: { query_embedding: number[]; match_threshold?: number; match_count?: number };
        Returns: Array<{ id: string; industry: string; section_type: string; description: string | null; template_json: Record<string, unknown>; similarity: number }>;
      };
      match_patterns: {
        Args: { query_embedding: number[]; match_threshold?: number; match_count?: number };
        Returns: Array<{ id: string; pattern_type: string; name: string; description: string | null; example_json: Record<string, unknown> | null; similarity: number }>;
      };
    };
  };
}
