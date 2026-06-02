export type EnsRecord = {
  address?: string | null;
  name?: string | null;
};

export type EnsRecordResponse = {
  ens?: EnsRecord | null;
};

export type EnsRecordsResponse = {
  ensRecords?: EnsRecord[] | null;
};

export type EnsRecordInput = {
  address?: string;
  name?: string;
  daoCode?: string;
};

export type EnsRecordsInput = {
  addresses?: string[];
  names?: string[];
  daoCode?: string;
};
