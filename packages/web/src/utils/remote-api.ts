export const isRemoteApiConfigured = () => {
  return !!process.env.NEXT_PUBLIC_DEGOV_API;
};

export const buildRemoteApiUrl = (): string | undefined => {
  console.log(JSON.stringify(process.env));
  const daoName = process.env.NEXT_PUBLIC_DEGOV_DAO;

  if (!isRemoteApiConfigured()) {
    return undefined;
  }

  return daoName
    ? `${process.env.NEXT_PUBLIC_DEGOV_API}/dao/config/${daoName}?format=yml`
    : `${process.env.NEXT_PUBLIC_DEGOV_API}/dao/config?format=yml`;
};
