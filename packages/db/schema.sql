-- Radiant Web Database Schema
-- Tables: users, projects, project_files, generations, businesses, component_embeddings, template_embeddings, pattern_embeddings
-- Vector tables: component_embeddings, template_embeddings, pattern_embeddings

-- Enable pgvector extension for vector embeddings (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'agency')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'trialing')),
  billing_cycle_start TIMESTAMPTZ,
  billing_cycle_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_stripe_customer ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'preview', 'deployed', 'failed')),
  industry TEXT,
  config JSONB DEFAULT '{}',
  vercel_project_id TEXT,
  vercel_deployment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Project files table
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, file_path)
);

-- Generations table
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  prompt_hash TEXT,
  system_prompt TEXT,
  user_prompt TEXT,
  response TEXT,
  model TEXT DEFAULT 'claude-sonnet-4-6',
  tokens_input INTEGER,
  tokens_output INTEGER,
  duration_ms INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  website TEXT,
  rating DECIMAL(2,1),
  review_count INTEGER,
  category TEXT,
  hours JSONB,
  photos JSONB,
  reviews JSONB,
  scraped_content JSONB,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Component embeddings table (vector/RAG)
CREATE TABLE component_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library TEXT NOT NULL,
  component_name TEXT NOT NULL,
  description TEXT,
  docs_text TEXT NOT NULL,
  code_example TEXT,
  tags TEXT[],
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(library, component_name)
);

CREATE INDEX ON component_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Template embeddings table (vector/RAG)
CREATE TABLE template_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT NOT NULL,
  section_type TEXT NOT NULL,
  description TEXT,
  template_json JSONB NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON template_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Pattern embeddings table (vector/RAG)
CREATE TABLE pattern_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  example_json JSONB,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON pattern_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Similarity search function for component retrieval (RAG)
CREATE OR REPLACE FUNCTION match_components(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  library TEXT,
  component_name TEXT,
  description TEXT,
  docs_text TEXT,
  code_example TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id, ce.library, ce.component_name, ce.description,
    ce.docs_text, ce.code_example,
    (1 - (ce.embedding <=> query_embedding))::FLOAT AS similarity
  FROM component_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Similarity search function for template retrieval (RAG)
CREATE OR REPLACE FUNCTION match_templates(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  industry TEXT,
  section_type TEXT,
  description TEXT,
  template_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.id, te.industry, te.section_type, te.description,
    te.template_json,
    (1 - (te.embedding <=> query_embedding))::FLOAT AS similarity
  FROM template_embeddings te
  WHERE 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Error logs table for centralized API error monitoring
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  status_code INTEGER NOT NULL DEFAULT 500,
  error_message TEXT NOT NULL,
  error_code TEXT,
  stack_trace TEXT,
  request_context JSONB DEFAULT '{}',
  user_id TEXT,
  project_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_error_logs_route_created ON error_logs (route, created_at DESC);
CREATE INDEX idx_error_logs_project ON error_logs (project_id) WHERE project_id IS NOT NULL;

-- Similarity search function for pattern retrieval (RAG)
-- =============================================
-- Row Level Security (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_embeddings ENABLE ROW LEVEL SECURITY;

-- Users: can only access their own row
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects: users can only CRUD their own projects
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects_insert_own" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- Project files: users can only access files for their own projects
CREATE POLICY "project_files_select_own" ON project_files
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid())
  );
CREATE POLICY "project_files_insert_own" ON project_files
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid())
  );
CREATE POLICY "project_files_update_own" ON project_files
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid())
  );
CREATE POLICY "project_files_delete_own" ON project_files
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid())
  );

-- Generations: users can read/insert for their own projects
CREATE POLICY "generations_select_own" ON generations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid())
  );
CREATE POLICY "generations_insert_own" ON generations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid())
  );

-- Businesses: readable by all authenticated users
CREATE POLICY "businesses_select_authenticated" ON businesses
  FOR SELECT USING (auth.role() = 'authenticated');

-- Embedding tables: readable by all authenticated users
CREATE POLICY "component_embeddings_select_authenticated" ON component_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "template_embeddings_select_authenticated" ON template_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "pattern_embeddings_select_authenticated" ON pattern_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Error logs: server-only via service role (RLS enabled, no user policies)
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Helper functions for vector similarity search
-- =============================================

CREATE OR REPLACE FUNCTION match_patterns(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pattern_type TEXT,
  name TEXT,
  description TEXT,
  example_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id, pe.pattern_type, pe.name, pe.description,
    pe.example_json,
    (1 - (pe.embedding <=> query_embedding))::FLOAT AS similarity
  FROM pattern_embeddings pe
  WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
