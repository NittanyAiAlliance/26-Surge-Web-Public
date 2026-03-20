-- Migration: 017_add_generation_tracking
-- Add columns to track Inngest pipeline step progress

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS generation_step text,
  ADD COLUMN IF NOT EXISTS generation_percent integer;

COMMENT ON COLUMN projects.generation_step IS 'Current Inngest pipeline step name (design_director, scaffold, homepage, etc.)';
COMMENT ON COLUMN projects.generation_percent IS 'Generation progress 0-100 for frontend polling';
