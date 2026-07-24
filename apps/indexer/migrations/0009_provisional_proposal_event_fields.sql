ALTER TABLE degov_provisional_proposal_overlay
  ADD COLUMN IF NOT EXISTS log_index INTEGER,
  ADD COLUMN IF NOT EXISTS transaction_index INTEGER,
  ADD COLUMN IF NOT EXISTS block_number NUMERIC(78, 0),
  ADD COLUMN IF NOT EXISTS block_timestamp NUMERIC(78, 0),
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS block_interval TEXT;
