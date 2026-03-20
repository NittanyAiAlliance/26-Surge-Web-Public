-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_embeddings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- USERS policies
-- =============================================
-- Users can read their own row
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own row
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own row (sign-up)
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- PROJECTS policies
-- =============================================
-- Users can read their own projects
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own projects
CREATE POLICY "projects_insert_own" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own projects
CREATE POLICY "projects_update_own" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own projects
CREATE POLICY "projects_delete_own" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- PROJECT_FILES policies
-- =============================================
-- Users can read files for their own projects
CREATE POLICY "project_files_select_own" ON project_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()
    )
  );

-- Users can insert files for their own projects
CREATE POLICY "project_files_insert_own" ON project_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()
    )
  );

-- Users can update files for their own projects
CREATE POLICY "project_files_update_own" ON project_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()
    )
  );

-- Users can delete files for their own projects
CREATE POLICY "project_files_delete_own" ON project_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()
    )
  );

-- =============================================
-- GENERATIONS policies
-- =============================================
-- Users can read generations for their own projects
CREATE POLICY "generations_select_own" ON generations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid()
    )
  );

-- Users can insert generations for their own projects
CREATE POLICY "generations_insert_own" ON generations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid()
    )
  );

-- =============================================
-- BUSINESSES policies
-- =============================================
-- All authenticated users can read businesses
CREATE POLICY "businesses_select_authenticated" ON businesses
  FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================
-- COMPONENT_EMBEDDINGS policies
-- =============================================
-- All authenticated users can read component embeddings
CREATE POLICY "component_embeddings_select_authenticated" ON component_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================
-- TEMPLATE_EMBEDDINGS policies
-- =============================================
-- All authenticated users can read template embeddings
CREATE POLICY "template_embeddings_select_authenticated" ON template_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================
-- PATTERN_EMBEDDINGS policies
-- =============================================
-- All authenticated users can read pattern embeddings
CREATE POLICY "pattern_embeddings_select_authenticated" ON pattern_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');
