-- Create generations table
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
