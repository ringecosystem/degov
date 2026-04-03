export type EnsRecord = {
  address?: string | null;
  name?: string | null;
};

export type EnsRecordResponse = {
  ens?: EnsRecord | null;
};

export type EnsRecordInput = {
  address?: string;
  name?: string;
};
