import { env } from "next-runtime-env";

export const useNotificationVisibility = () => {
  const clientApi =
    typeof window !== "undefined"
      ? env("NEXT_PUBLIC_NOTIFICATION_API")
      : undefined;
  return !!clientApi;
};
