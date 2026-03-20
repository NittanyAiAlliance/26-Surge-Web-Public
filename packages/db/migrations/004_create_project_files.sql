-- Create project_files table
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, file_path)
);
