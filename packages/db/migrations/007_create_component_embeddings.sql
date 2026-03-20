-- Create component_embeddings table
CREATE TABLE component_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library TEXT NOT NULL,
  component_name TEXT NOT NULL,
  description TEXT,
  docs_text TEXT NOT NULL,
  code_example TEXT,
  tags TEXT[],
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(library, component_name)
);

CREATE INDEX ON component_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
