-- Add generation_step column to track multi-step generation pipeline
ALTER TABLE generations
ADD COLUMN IF NOT EXISTS generation_step text DEFAULT 'full'
CHECK (generation_step IN ('design_director', 'scaffold', 'homepage', 'page', 'full'));

COMMENT ON COLUMN generations.generation_step IS 'Which step of the generation pipeline this record represents';
