-- Add Stripe billing columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'trialing')),
  ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_cycle_end TIMESTAMPTZ;

-- Index for fast lookup by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
