-- Create businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  website TEXT,
  rating DECIMAL(2,1),
  review_count INTEGER,
  category TEXT,
  hours JSONB,
  photos JSONB,
  reviews JSONB,
  scraped_content JSONB,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
