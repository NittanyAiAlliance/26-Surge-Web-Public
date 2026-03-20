-- Similarity search function for component retrieval (RAG)
CREATE OR REPLACE FUNCTION match_components(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  library TEXT,
  component_name TEXT,
  description TEXT,
  docs_text TEXT,
  code_example TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id, ce.library, ce.component_name, ce.description,
    ce.docs_text, ce.code_example,
    (1 - (ce.embedding <=> query_embedding))::FLOAT AS similarity
  FROM component_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Similarity search function for template retrieval (RAG)
CREATE OR REPLACE FUNCTION match_templates(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  industry TEXT,
  section_type TEXT,
  description TEXT,
  template_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.id, te.industry, te.section_type, te.description,
    te.template_json,
    (1 - (te.embedding <=> query_embedding))::FLOAT AS similarity
  FROM template_embeddings te
  WHERE 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Similarity search function for pattern retrieval (RAG)
CREATE OR REPLACE FUNCTION match_patterns(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pattern_type TEXT,
  name TEXT,
  description TEXT,
  example_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id, pe.pattern_type, pe.name, pe.description,
    pe.example_json,
    (1 - (pe.embedding <=> query_embedding))::FLOAT AS similarity
  FROM pattern_embeddings pe
  WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
