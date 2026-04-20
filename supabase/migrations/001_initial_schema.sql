-- Users table for authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Entries table for diary records
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sentiment_score REAL,
  primary_mood TEXT,
  mood_tags TEXT[],
  energy_level REAL,
  stress_level REAL,
  user_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Enable row level security
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own entries"
  ON entries FOR ALL
  USING (auth.uid() = user_id);
