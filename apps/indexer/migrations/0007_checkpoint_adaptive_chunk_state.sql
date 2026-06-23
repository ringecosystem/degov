-- Persist per-checkpoint adaptive chunk sizing state across indexer passes.

ALTER TABLE degov_indexer_checkpoint
  ADD COLUMN IF NOT EXISTS adaptive_chunk_size BIGINT,
  ADD COLUMN IF NOT EXISTS adaptive_chunk_reason TEXT,
  ADD COLUMN IF NOT EXISTS adaptive_chunk_updated_at TIMESTAMPTZ;
