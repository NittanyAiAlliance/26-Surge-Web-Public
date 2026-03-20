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

-- Index for querying recent errors by route
CREATE INDEX idx_error_logs_route_created ON error_logs (route, created_at DESC);

-- Index for querying errors by project
CREATE INDEX idx_error_logs_project ON error_logs (project_id) WHERE project_id IS NOT NULL;

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert/read all error logs (no user-level access needed)
-- Error logs are written by the server using the service role client
