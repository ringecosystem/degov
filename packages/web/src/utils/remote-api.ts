import { env } from "next-runtime-env";

const LOCAL_CONFIG_FLAG = "enable";

const isLocalConfigEnabledServer = () =>
  (process.env.NEXT_PUBLIC_LOCAL_CONFIG ?? "").toLowerCase() ===
  LOCAL_CONFIG_FLAG;

const isLocalConfigEnabledClient = () =>
  (env("NEXT_PUBLIC_LOCAL_CONFIG") ?? "").toLowerCase() === LOCAL_CONFIG_FLAG;

// === Server-side functions (use process.env) ===
export const isDegovApiConfiguredServer = () => {
  if (isLocalConfigEnabledServer()) return false;
  const NEXT_PUBLIC_DEGOV_API = process.env.NEXT_PUBLIC_DEGOV_API;
  return !!NEXT_PUBLIC_DEGOV_API;
};

export const degovGraphqlApi = (): string | undefined => {
  const clientApi =
    typeof window !== "undefined" ? env("NEXT_PUBLIC_DEGOV_API") : undefined;
  const NEXT_PUBLIC_DEGOV_API = clientApi || process.env.NEXT_PUBLIC_DEGOV_API;

  if (!NEXT_PUBLIC_DEGOV_API) return undefined;
  return `${NEXT_PUBLIC_DEGOV_API}/graphql`;
};

export const degovApiDaoConfigServer = (): string | undefined => {
  if (isLocalConfigEnabledServer()) return undefined;
  const NEXT_PUBLIC_DEGOV_API = process.env.NEXT_PUBLIC_DEGOV_API;
  const NEXT_PUBLIC_DEGOV_DAO = process.env.NEXT_PUBLIC_DEGOV_DAO;

  if (!NEXT_PUBLIC_DEGOV_API) return undefined;

  return NEXT_PUBLIC_DEGOV_DAO
    ? `${NEXT_PUBLIC_DEGOV_API}/dao/config/${NEXT_PUBLIC_DEGOV_DAO}?format=yml`
    : `${NEXT_PUBLIC_DEGOV_API}/dao/config?format=yml`;
};

export const degovApiDaoConfigClient = (): string | undefined => {
  if (isLocalConfigEnabledClient()) return undefined;
  const NEXT_PUBLIC_DEGOV_API = env("NEXT_PUBLIC_DEGOV_API");
  const NEXT_PUBLIC_DEGOV_DAO = env("NEXT_PUBLIC_DEGOV_DAO");

  if (!NEXT_PUBLIC_DEGOV_API) return undefined;

  return NEXT_PUBLIC_DEGOV_DAO
    ? `${NEXT_PUBLIC_DEGOV_API}/dao/config/${NEXT_PUBLIC_DEGOV_DAO}?format=yml`
    : `${NEXT_PUBLIC_DEGOV_API}/dao/config?format=yml`;
};
