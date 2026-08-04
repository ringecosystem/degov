ALTER TABLE data_metric
  ADD COLUMN IF NOT EXISTS delegate_profiles_count INTEGER;

CREATE TABLE IF NOT EXISTS delegate_profile (
  chain_id INTEGER NOT NULL,
  dao_code TEXT NOT NULL,
  governor_address TEXT NOT NULL,
  delegate TEXT NOT NULL,
  PRIMARY KEY (chain_id, dao_code, governor_address, delegate),
  CONSTRAINT delegate_profile_governor_address_normalized
    CHECK (governor_address = lower(governor_address)),
  CONSTRAINT delegate_profile_delegate_normalized
    CHECK (delegate = lower(delegate)),
  CONSTRAINT delegate_profile_delegate_nonzero
    CHECK (delegate <> '0x0000000000000000000000000000000000000000')
);
