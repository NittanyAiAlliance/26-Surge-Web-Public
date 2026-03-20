-- Create projects table
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
