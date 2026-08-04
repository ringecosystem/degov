CREATE TABLE IF NOT EXISTS degov_provisional_vote_cast_group_overlay (
  id TEXT PRIMARY KEY,
  segment_id TEXT REFERENCES degov_provisional_segment (id) ON UPDATE CASCADE ON DELETE SET NULL,
  contract_set_id TEXT NOT NULL,
  chain_id INTEGER,
  chain_name TEXT,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  type TEXT NOT NULL,
  voter TEXT NOT NULL,
  ref_proposal_id TEXT NOT NULL,
  support INTEGER NOT NULL,
  weight NUMERIC(78, 0) NOT NULL,
  reason TEXT,
  params TEXT,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  anchor_block_number NUMERIC(78, 0),
  anchor_block_hash TEXT,
  anchor_parent_hash TEXT,
  anchor_block_timestamp NUMERIC(78, 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT degov_provisional_vote_cast_group_overlay_scope_unique UNIQUE NULLS NOT DISTINCT (
    contract_set_id,
    chain_id,
    dao_code,
    governor_address,
    id,
    source
  )
);

CREATE INDEX IF NOT EXISTS degov_provisional_vote_cast_group_overlay_lookup_idx
  ON degov_provisional_vote_cast_group_overlay (chain_id, contract_set_id, dao_code, governor_address, ref_proposal_id);
CREATE INDEX IF NOT EXISTS degov_provisional_vote_cast_group_overlay_voter_idx
  ON degov_provisional_vote_cast_group_overlay (chain_id, contract_set_id, dao_code, governor_address, voter);
CREATE INDEX IF NOT EXISTS degov_provisional_vote_cast_group_overlay_segment_idx
  ON degov_provisional_vote_cast_group_overlay (segment_id);

CREATE TABLE IF NOT EXISTS degov_provisional_proposal_event_overlay (
  id TEXT PRIMARY KEY,
  segment_id TEXT REFERENCES degov_provisional_segment (id) ON UPDATE CASCADE ON DELETE SET NULL,
  contract_set_id TEXT NOT NULL,
  chain_id INTEGER,
  chain_name TEXT,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  event_type TEXT NOT NULL,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  eta_seconds NUMERIC(78, 0),
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  anchor_block_number NUMERIC(78, 0),
  anchor_block_hash TEXT,
  anchor_parent_hash TEXT,
  anchor_block_timestamp NUMERIC(78, 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT degov_provisional_proposal_event_overlay_scope_unique UNIQUE NULLS NOT DISTINCT (
    contract_set_id,
    chain_id,
    dao_code,
    governor_address,
    id,
    source
  )
);

CREATE INDEX IF NOT EXISTS degov_provisional_proposal_event_overlay_lookup_idx
  ON degov_provisional_proposal_event_overlay (chain_id, contract_set_id, dao_code, governor_address, event_type, proposal_id);
CREATE INDEX IF NOT EXISTS degov_provisional_proposal_event_overlay_segment_idx
  ON degov_provisional_proposal_event_overlay (segment_id);
