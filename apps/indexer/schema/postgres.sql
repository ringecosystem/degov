-- Datalens-native DeGov indexer PostgreSQL schema.
--
-- Ownership:
-- - This file is the canonical fresh index initialization schema.
-- - The Rust Datalens indexer applies this schema to a clean Postgres database.
-- - GraphQL/API-visible table compatibility is tracked against
--   apps/indexer/reference/schema.graphql.
-- - No historical in-place migration is supported from removed SQD/Subsquid
--   v3/v4 index databases. Operators must reset or recreate the Postgres index
--   database and run from the configured Datalens start block.
--
-- Large EVM uint256 vote and power values use NUMERIC(78, 0) to preserve
-- precision without floating-point coercion.

CREATE TABLE IF NOT EXISTS degov_indexer_checkpoint (
  dao_code TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract_set_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  data_source_version TEXT NOT NULL,
  next_block NUMERIC(78, 0) NOT NULL,
  processed_height NUMERIC(78, 0),
  target_height NUMERIC(78, 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  lock_owner TEXT,
  locked_at TIMESTAMPTZ,
  PRIMARY KEY (dao_code, chain_id, contract_set_id, stream_id, data_source_version)
);

CREATE INDEX IF NOT EXISTS degov_indexer_checkpoint_processed_height_idx
  ON degov_indexer_checkpoint (chain_id, dao_code, contract_set_id, processed_height);

-- Temporary compatibility bridge for existing sync-lag/synced-percentage
-- consumers that still read SQD's built-in squidStatus field.
CREATE SCHEMA IF NOT EXISTS squid_processor;

CREATE TABLE IF NOT EXISTS squid_processor.status (
  id INTEGER PRIMARY KEY DEFAULT 0,
  height NUMERIC(78, 0) NOT NULL DEFAULT 0,
  hash TEXT
);

CREATE TABLE IF NOT EXISTS degov_indexer_reconcile_task (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  dao_code TEXT,
  governor_address TEXT NOT NULL,
  task_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  processed_at TIMESTAMPTZ,
  error TEXT,
  first_seen_block_number NUMERIC(78, 0) NOT NULL,
  last_seen_block_number NUMERIC(78, 0) NOT NULL,
  last_seen_transaction_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT degov_indexer_reconcile_task_unique_subject UNIQUE NULLS NOT DISTINCT (
    chain_id,
    dao_code,
    governor_address,
    task_type,
    subject_id
  )
);

CREATE INDEX IF NOT EXISTS degov_indexer_reconcile_task_status_idx
  ON degov_indexer_reconcile_task (status, next_run_at);

CREATE TABLE IF NOT EXISTS delegate_changed (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  delegator TEXT NOT NULL,
  from_delegate TEXT NOT NULL,
  to_delegate TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS delegate_changed_chain_governor_delegator_idx
  ON delegate_changed (chain_id, governor_address, delegator);

CREATE TABLE IF NOT EXISTS delegate_votes_changed (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  delegate TEXT NOT NULL,
  previous_votes NUMERIC(78, 0) NOT NULL,
  new_votes NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS delegate_votes_changed_chain_governor_delegate_idx
  ON delegate_votes_changed (chain_id, governor_address, delegate);

CREATE TABLE IF NOT EXISTS token_transfer (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  value NUMERIC(78, 0) NOT NULL,
  standard TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS token_transfer_chain_governor_token_idx
  ON token_transfer (chain_id, governor_address, token_address);
CREATE INDEX IF NOT EXISTS token_transfer_transaction_hash_idx
  ON token_transfer (transaction_hash);

CREATE TABLE IF NOT EXISTS vote_power_checkpoint (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  account TEXT NOT NULL,
  clock_mode TEXT NOT NULL,
  timepoint NUMERIC(78, 0) NOT NULL,
  previous_power NUMERIC(78, 0) NOT NULL,
  new_power NUMERIC(78, 0) NOT NULL,
  delta NUMERIC(78, 0) NOT NULL,
  source TEXT,
  cause TEXT NOT NULL,
  delegator TEXT,
  from_delegate TEXT,
  to_delegate TEXT,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vote_power_checkpoint_lookup_idx
  ON vote_power_checkpoint (chain_id, governor_address, token_address, account, clock_mode, timepoint);

CREATE TABLE IF NOT EXISTS token_balance_checkpoint (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  account TEXT NOT NULL,
  previous_balance NUMERIC(78, 0) NOT NULL,
  new_balance NUMERIC(78, 0) NOT NULL,
  delta NUMERIC(78, 0) NOT NULL,
  source TEXT NOT NULL,
  cause TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS token_balance_checkpoint_lookup_idx
  ON token_balance_checkpoint (chain_id, governor_address, token_address, account, block_number);

CREATE TABLE IF NOT EXISTS onchain_refresh_task (
  id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  dao_code TEXT,
  governor_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  account TEXT NOT NULL,
  refresh_balance BOOLEAN NOT NULL,
  refresh_power BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  first_seen_block_number NUMERIC(78, 0) NOT NULL,
  last_seen_block_number NUMERIC(78, 0) NOT NULL,
  last_seen_block_timestamp NUMERIC(78, 0) NOT NULL,
  last_seen_transaction_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  next_run_at NUMERIC(78, 0) NOT NULL,
  locked_at NUMERIC(78, 0),
  locked_by TEXT,
  processed_at NUMERIC(78, 0),
  error TEXT,
  pending_after_lock BOOLEAN NOT NULL,
  pending_after_lock_block_number NUMERIC(78, 0),
  pending_after_lock_block_timestamp NUMERIC(78, 0),
  pending_after_lock_transaction_hash TEXT,
  created_at NUMERIC(78, 0) NOT NULL,
  updated_at NUMERIC(78, 0) NOT NULL,
  CONSTRAINT onchain_refresh_task_account_unique UNIQUE NULLS NOT DISTINCT (
    chain_id,
    dao_code,
    governor_address,
    token_address,
    account
  )
);

CREATE INDEX IF NOT EXISTS onchain_refresh_task_status_idx
  ON onchain_refresh_task (status, next_run_at);

CREATE TABLE IF NOT EXISTS proposal_canceled (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_canceled_lookup_idx
  ON proposal_canceled (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS proposal_created (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  proposer TEXT NOT NULL,
  targets TEXT[] NOT NULL,
  values TEXT[] NOT NULL,
  signatures TEXT[] NOT NULL,
  calldatas TEXT[] NOT NULL,
  vote_start NUMERIC(78, 0) NOT NULL,
  vote_end NUMERIC(78, 0) NOT NULL,
  description TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_created_lookup_idx
  ON proposal_created (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS proposal_executed (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_executed_lookup_idx
  ON proposal_executed (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS proposal_queued (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  eta_seconds NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_queued_lookup_idx
  ON proposal_queued (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS proposal_extended (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  extended_deadline NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_extended_lookup_idx
  ON proposal_extended (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS voting_delay_set (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_voting_delay NUMERIC(78, 0) NOT NULL,
  new_voting_delay NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS voting_delay_set_lookup_idx
  ON voting_delay_set (chain_id, governor_address, block_number);

CREATE TABLE IF NOT EXISTS voting_period_set (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_voting_period NUMERIC(78, 0) NOT NULL,
  new_voting_period NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS voting_period_set_lookup_idx
  ON voting_period_set (chain_id, governor_address, block_number);

CREATE TABLE IF NOT EXISTS proposal_threshold_set (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_proposal_threshold NUMERIC(78, 0) NOT NULL,
  new_proposal_threshold NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_threshold_set_lookup_idx
  ON proposal_threshold_set (chain_id, governor_address, block_number);

CREATE TABLE IF NOT EXISTS quorum_numerator_updated (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_quorum_numerator NUMERIC(78, 0) NOT NULL,
  new_quorum_numerator NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS quorum_numerator_updated_lookup_idx
  ON quorum_numerator_updated (chain_id, governor_address, block_number);

CREATE TABLE IF NOT EXISTS late_quorum_vote_extension_set (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_late_quorum_vote_extension NUMERIC(78, 0) NOT NULL,
  new_late_quorum_vote_extension NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS late_quorum_vote_extension_set_lookup_idx
  ON late_quorum_vote_extension_set (chain_id, governor_address, block_number);

CREATE TABLE IF NOT EXISTS timelock_change (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_timelock TEXT NOT NULL,
  new_timelock TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS timelock_change_lookup_idx
  ON timelock_change (chain_id, governor_address, block_number);

CREATE TABLE IF NOT EXISTS vote_cast (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  voter TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  support INTEGER NOT NULL,
  weight NUMERIC(78, 0) NOT NULL,
  reason TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vote_cast_lookup_idx
  ON vote_cast (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS vote_cast_with_params (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  voter TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  support INTEGER NOT NULL,
  weight NUMERIC(78, 0) NOT NULL,
  reason TEXT NOT NULL,
  params TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vote_cast_with_params_lookup_idx
  ON vote_cast_with_params (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS proposal (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  proposer TEXT NOT NULL,
  targets TEXT[] NOT NULL,
  values TEXT[] NOT NULL,
  signatures TEXT[] NOT NULL,
  calldatas TEXT[] NOT NULL,
  vote_start NUMERIC(78, 0) NOT NULL,
  vote_end NUMERIC(78, 0) NOT NULL,
  description TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL,
  metrics_votes_count INTEGER,
  metrics_votes_with_params_count INTEGER,
  metrics_votes_without_params_count INTEGER,
  metrics_votes_weight_for_sum NUMERIC(78, 0),
  metrics_votes_weight_against_sum NUMERIC(78, 0),
  metrics_votes_weight_abstain_sum NUMERIC(78, 0),
  title TEXT NOT NULL,
  vote_start_timestamp NUMERIC(78, 0) NOT NULL,
  vote_end_timestamp NUMERIC(78, 0) NOT NULL,
  block_interval TEXT,
  description_hash TEXT,
  proposal_snapshot NUMERIC(78, 0),
  proposal_deadline NUMERIC(78, 0),
  proposal_eta NUMERIC(78, 0),
  queue_ready_at NUMERIC(78, 0),
  queue_expires_at NUMERIC(78, 0),
  counting_mode TEXT,
  timelock_address TEXT,
  timelock_grace_period NUMERIC(78, 0),
  clock_mode TEXT NOT NULL,
  quorum NUMERIC(78, 0) NOT NULL,
  decimals NUMERIC(78, 0) NOT NULL,
  CONSTRAINT proposal_lookup_unique UNIQUE NULLS NOT DISTINCT (chain_id, governor_address, proposal_id)
);

CREATE INDEX IF NOT EXISTS proposal_lookup_idx
  ON proposal (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS vote_cast_group (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL REFERENCES proposal (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  voter TEXT NOT NULL,
  ref_proposal_id TEXT NOT NULL,
  support INTEGER NOT NULL,
  weight NUMERIC(78, 0) NOT NULL,
  reason TEXT NOT NULL,
  params TEXT,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vote_cast_group_lookup_idx
  ON vote_cast_group (chain_id, governor_address, ref_proposal_id);

CREATE TABLE IF NOT EXISTS proposal_action (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  proposal_ref TEXT NOT NULL REFERENCES proposal (id) ON DELETE CASCADE,
  action_index INTEGER NOT NULL,
  target TEXT NOT NULL,
  value TEXT NOT NULL,
  signature TEXT NOT NULL,
  calldata TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_action_lookup_idx
  ON proposal_action (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS proposal_state_epoch (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  proposal_ref TEXT NOT NULL REFERENCES proposal (id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  start_timepoint NUMERIC(78, 0),
  end_timepoint NUMERIC(78, 0),
  start_block_number NUMERIC(78, 0),
  start_block_timestamp NUMERIC(78, 0),
  end_block_number NUMERIC(78, 0),
  end_block_timestamp NUMERIC(78, 0),
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_state_epoch_lookup_idx
  ON proposal_state_epoch (chain_id, governor_address, proposal_id, state);

CREATE TABLE IF NOT EXISTS governance_parameter_checkpoint (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  event_name TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  value_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS governance_parameter_checkpoint_lookup_idx
  ON governance_parameter_checkpoint (chain_id, governor_address, parameter_name);

CREATE TABLE IF NOT EXISTS proposal_deadline_extension (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_id TEXT NOT NULL,
  proposal_ref TEXT NOT NULL REFERENCES proposal (id) ON DELETE CASCADE,
  previous_deadline NUMERIC(78, 0),
  new_deadline NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposal_deadline_extension_lookup_idx
  ON proposal_deadline_extension (chain_id, governor_address, proposal_id);

CREATE TABLE IF NOT EXISTS timelock_operation (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  timelock_address TEXT NOT NULL,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposal_ref TEXT REFERENCES proposal (id) ON DELETE SET NULL,
  proposal_id TEXT,
  operation_id TEXT NOT NULL,
  timelock_type TEXT NOT NULL,
  predecessor TEXT,
  salt TEXT,
  state TEXT NOT NULL,
  call_count INTEGER,
  executed_call_count INTEGER,
  delay_seconds NUMERIC(78, 0),
  ready_at NUMERIC(78, 0),
  expires_at NUMERIC(78, 0),
  queued_block_number NUMERIC(78, 0),
  queued_block_timestamp NUMERIC(78, 0),
  queued_transaction_hash TEXT,
  cancelled_block_number NUMERIC(78, 0),
  cancelled_block_timestamp NUMERIC(78, 0),
  cancelled_transaction_hash TEXT,
  executed_block_number NUMERIC(78, 0),
  executed_block_timestamp NUMERIC(78, 0),
  executed_transaction_hash TEXT,
  CONSTRAINT timelock_operation_lookup_unique UNIQUE NULLS NOT DISTINCT (
    chain_id,
    governor_address,
    timelock_address,
    proposal_id,
    operation_id
  )
);

CREATE INDEX IF NOT EXISTS timelock_operation_lookup_idx
  ON timelock_operation (chain_id, governor_address, timelock_address, proposal_id, operation_id);

CREATE TABLE IF NOT EXISTS timelock_call (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  timelock_address TEXT NOT NULL,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  operation_id TEXT NOT NULL,
  operation_ref TEXT NOT NULL REFERENCES timelock_operation (id) ON DELETE CASCADE,
  proposal_ref TEXT REFERENCES proposal (id) ON DELETE SET NULL,
  proposal_id TEXT,
  proposal_action_id TEXT,
  proposal_action_index INTEGER,
  action_index INTEGER NOT NULL,
  target TEXT NOT NULL,
  value TEXT NOT NULL,
  data TEXT NOT NULL,
  predecessor TEXT,
  delay_seconds NUMERIC(78, 0),
  state TEXT NOT NULL,
  scheduled_block_number NUMERIC(78, 0),
  scheduled_block_timestamp NUMERIC(78, 0),
  scheduled_transaction_hash TEXT,
  executed_block_number NUMERIC(78, 0),
  executed_block_timestamp NUMERIC(78, 0),
  executed_transaction_hash TEXT
);

CREATE INDEX IF NOT EXISTS timelock_call_lookup_idx
  ON timelock_call (chain_id, governor_address, timelock_address, operation_id, action_index);

CREATE TABLE IF NOT EXISTS timelock_role_event (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  timelock_address TEXT NOT NULL,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  event_name TEXT NOT NULL,
  role TEXT NOT NULL,
  role_label TEXT,
  account TEXT,
  sender TEXT,
  previous_admin_role TEXT,
  previous_admin_role_label TEXT,
  new_admin_role TEXT,
  new_admin_role_label TEXT,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS timelock_role_event_lookup_idx
  ON timelock_role_event (chain_id, governor_address, timelock_address, role, event_name);

CREATE TABLE IF NOT EXISTS timelock_min_delay_change (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  timelock_address TEXT NOT NULL,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  old_duration NUMERIC(78, 0) NOT NULL,
  new_duration NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS timelock_min_delay_change_lookup_idx
  ON timelock_min_delay_change (chain_id, governor_address, timelock_address, block_number);

CREATE TABLE IF NOT EXISTS data_metric (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  proposals_count INTEGER,
  votes_count INTEGER,
  votes_with_params_count INTEGER,
  votes_without_params_count INTEGER,
  votes_weight_for_sum NUMERIC(78, 0),
  votes_weight_against_sum NUMERIC(78, 0),
  votes_weight_abstain_sum NUMERIC(78, 0),
  power_sum NUMERIC(78, 0),
  member_count INTEGER,
  CONSTRAINT data_metric_lookup_unique UNIQUE NULLS NOT DISTINCT (
    chain_id,
    governor_address,
    dao_code
  )
);

CREATE INDEX IF NOT EXISTS data_metric_lookup_idx
  ON data_metric (chain_id, governor_address, dao_code);

CREATE TABLE IF NOT EXISTS delegate_rolling (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  delegator TEXT NOT NULL,
  from_delegate TEXT NOT NULL,
  to_delegate TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL,
  from_previous_votes NUMERIC(78, 0),
  from_new_votes NUMERIC(78, 0),
  to_previous_votes NUMERIC(78, 0),
  to_new_votes NUMERIC(78, 0)
);

CREATE INDEX IF NOT EXISTS delegate_rolling_delegator_idx
  ON delegate_rolling (chain_id, governor_address, delegator);
CREATE INDEX IF NOT EXISTS delegate_rolling_transaction_hash_idx
  ON delegate_rolling (transaction_hash);

CREATE TABLE IF NOT EXISTS delegate (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  from_delegate TEXT NOT NULL,
  to_delegate TEXT NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL,
  is_current BOOLEAN NOT NULL,
  power NUMERIC(78, 0) NOT NULL
);

CREATE INDEX IF NOT EXISTS delegate_lookup_idx
  ON delegate (chain_id, governor_address, from_delegate, to_delegate);

CREATE TABLE IF NOT EXISTS contributor (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL,
  last_vote_block_number NUMERIC(78, 0),
  last_vote_timestamp NUMERIC(78, 0),
  power NUMERIC(78, 0) NOT NULL,
  balance NUMERIC(78, 0),
  delegates_count_all INTEGER NOT NULL,
  delegates_count_effective INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS contributor_lookup_idx
  ON contributor (chain_id, governor_address, id);

CREATE TABLE IF NOT EXISTS delegate_mapping (
  id TEXT PRIMARY KEY,
  chain_id INTEGER,
  dao_code TEXT,
  governor_address TEXT,
  token_address TEXT,
  contract_address TEXT,
  log_index INTEGER,
  transaction_index INTEGER,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  power NUMERIC(78, 0) NOT NULL,
  block_number NUMERIC(78, 0) NOT NULL,
  block_timestamp NUMERIC(78, 0) NOT NULL,
  transaction_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS delegate_mapping_lookup_idx
  ON delegate_mapping (chain_id, governor_address, "from");
