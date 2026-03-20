-- Migration 001: Enable pgvector extension
-- Adds the vector data type for storing embeddings (RAG)
CREATE EXTENSION IF NOT EXISTS vector;
