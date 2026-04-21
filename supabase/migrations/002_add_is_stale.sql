-- Add is_stale field to mark replaced entries after editing
ALTER TABLE entries ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE;

-- Create index for efficient stale filtering queries
CREATE INDEX IF NOT EXISTS idx_entries_session_stale ON entries(session_id, is_stale) WHERE is_stale = FALSE;