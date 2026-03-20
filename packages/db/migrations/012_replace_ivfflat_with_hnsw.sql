-- Replace IVFFlat indexes with HNSW indexes
-- IVFFlat with lists >> row_count causes missed results due to sparse probing.
-- HNSW works correctly regardless of dataset size.

DROP INDEX IF EXISTS component_embeddings_embedding_idx;
DROP INDEX IF EXISTS template_embeddings_embedding_idx;
DROP INDEX IF EXISTS pattern_embeddings_embedding_idx;

CREATE INDEX component_embeddings_embedding_idx
  ON component_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX template_embeddings_embedding_idx
  ON template_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX pattern_embeddings_embedding_idx
  ON pattern_embeddings USING hnsw (embedding vector_cosine_ops);
