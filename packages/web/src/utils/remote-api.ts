import { env } from "next-runtime-env";

// === Server-side functions (use process.env) ===
export const isRemoteApiConfigured = () => {
  const NEXT_PUBLIC_DEGOV_API = process.env.NEXT_PUBLIC_DEGOV_API;
  return !!NEXT_PUBLIC_DEGOV_API;
};

export const buildRemoteApiUrl = (): string | undefined => {
  const NEXT_PUBLIC_DEGOV_API = process.env.NEXT_PUBLIC_DEGOV_API;
  const NEXT_PUBLIC_DEGOV_DAO = process.env.NEXT_PUBLIC_DEGOV_DAO;

  if (!NEXT_PUBLIC_DEGOV_API) return undefined;

  return NEXT_PUBLIC_DEGOV_DAO
    ? `${NEXT_PUBLIC_DEGOV_API}/dao/config/${NEXT_PUBLIC_DEGOV_DAO}?format=yml`
    : `${NEXT_PUBLIC_DEGOV_API}/dao/config?format=yml`;
};

// === Client-side functions (use next-runtime-env) ===
export const isRemoteApiConfiguredClient = () => {
  const NEXT_PUBLIC_DEGOV_API = env("NEXT_PUBLIC_DEGOV_API");
  return !!NEXT_PUBLIC_DEGOV_API;
};

export const buildRemoteApiUrlClient = (): string | undefined => {
  const NEXT_PUBLIC_DEGOV_API = env("NEXT_PUBLIC_DEGOV_API");
  const NEXT_PUBLIC_DEGOV_DAO = env("NEXT_PUBLIC_DEGOV_DAO");

  if (!NEXT_PUBLIC_DEGOV_API) return undefined;

  return NEXT_PUBLIC_DEGOV_DAO
    ? `${NEXT_PUBLIC_DEGOV_API}/dao/config/${NEXT_PUBLIC_DEGOV_DAO}?format=yml`
    : `${NEXT_PUBLIC_DEGOV_API}/dao/config?format=yml`;
};
