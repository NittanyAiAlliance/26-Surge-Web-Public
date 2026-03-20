-- Create template_embeddings table
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
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
