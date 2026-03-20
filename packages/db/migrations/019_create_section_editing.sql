-- Track which sections belong to which pages
-- Populated automatically after generation completes
CREATE TABLE project_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_path TEXT NOT NULL,                    -- "/" or "/about" or "/contact"
  section_name TEXT NOT NULL,                 -- "hero", "reviews", "contact"
  component_path TEXT NOT NULL,               -- "components/Hero.tsx"
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, page_path, section_name)
);

CREATE INDEX idx_project_sections_project ON project_sections(project_id);

-- Store previous versions for undo (1 row per edit)
CREATE TABLE file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  edit_instruction TEXT,                       -- what the user asked for
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_versions_lookup
  ON file_versions(project_id, file_path, version DESC);
