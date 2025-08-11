export const isRemoteApiConfigured = () => {
  return !!process.env.NEXT_PUBLIC_DEGOV_API;
};

export function degovApiHost(): string | undefined {
  return process.env.NEXT_PUBLIC_DEGOV_API;
}

export const degovApiDaoConfig = (): string | undefined => {
  const daoCode = process.env.NEXT_PUBLIC_DEGOV_DAO;

  if (!isRemoteApiConfigured()) {
    return undefined;
  }

  const apiHost = degovApiHost();

  return daoCode
    ? `${apiHost}/dao/config/${daoCode}?format=yml`
    : `${apiHost}/dao/config?format=yml`;
};

export const degovApiDaoDetect = (): string | undefined => {
  if (!isRemoteApiConfigured()) {
    return undefined;
  }

  const apiHost = degovApiHost();
  return `${apiHost}/dao/detect`;
};
