export const isRemoteApiConfigured = () => {
  return !!process.env.DEGOV_API;
};

export const buildRemoteApiUrl = (): string | undefined => {
  const daoName = process.env.DEGOV_DAO;

  if (!isRemoteApiConfigured()) {
    return undefined;
  }

  return daoName
    ? `${process.env.DEGOV_API}/dao/config/${daoName}?format=yml`
    : `${process.env.DEGOV_API}/dao/config?format=yml`;
};
