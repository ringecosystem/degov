CREATE TABLE IF NOT EXISTS degov_indexer_latest_head (
  dao_code TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract_set_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  data_source_version TEXT NOT NULL,
  latest_height NUMERIC(78, 0) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dao_code, chain_id, contract_set_id, stream_id, data_source_version)
);
