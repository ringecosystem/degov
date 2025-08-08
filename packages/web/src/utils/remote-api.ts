import { env } from "next-runtime-env";

export const isRemoteApiConfigured = () => {
  const NEXT_PUBLIC_DEGOV_API = env("NEXT_PUBLIC_DEGOV_API");
  console.log("NEXT_PUBLIC_DEGOV_API", NEXT_PUBLIC_DEGOV_API);
  return !!NEXT_PUBLIC_DEGOV_API;
};

export const buildRemoteApiUrl = (): string | undefined => {
  const NEXT_PUBLIC_DEGOV_API = env("NEXT_PUBLIC_DEGOV_API");
  const NEXT_PUBLIC_DEGOV_DAO = env("NEXT_PUBLIC_DEGOV_DAO");
  console.log("NEXT_PUBLIC_DEGOV_DAO", NEXT_PUBLIC_DEGOV_DAO);
  console.log("NEXT_PUBLIC_DEGOV_API", NEXT_PUBLIC_DEGOV_API);
  const daoName = NEXT_PUBLIC_DEGOV_DAO;

  if (!isRemoteApiConfigured()) {
    return undefined;
  }

  return daoName
    ? `${NEXT_PUBLIC_DEGOV_API}/dao/config/${daoName}?format=yml`
    : `${NEXT_PUBLIC_DEGOV_API}/dao/config?format=yml`;
};
