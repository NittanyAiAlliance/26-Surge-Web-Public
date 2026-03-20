-- Create pattern_embeddings table
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
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
