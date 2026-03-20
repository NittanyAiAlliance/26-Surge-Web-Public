-- Rate limiting table for cross-instance coordination
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,          -- Rate limit key (e.g., "generate:192.168.1.1")
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by key and time window
CREATE INDEX idx_rate_limits_key_timestamp ON rate_limits (key, timestamp DESC);

-- Auto-cleanup: delete entries older than 2 hours (generous buffer over 1hr window)
-- This should be run as a Supabase cron job or pg_cron.
-- For now, we clean up inline during checks.
