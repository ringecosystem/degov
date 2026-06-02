export const ensRecordQueryKey = (
  daoCode: string | undefined,
  address: string
) => ["ens-record", daoCode, address.toLowerCase()];
