import { env } from "next-runtime-env";
import { useAccount } from "wagmi";

export const useNotificationVisibility = () => {
  const { isConnected } = useAccount();
  const clientApi =
    typeof window !== "undefined"
      ? env("NEXT_PUBLIC_NOTIFICATION_API")
      : undefined;
  return isConnected && !!clientApi;
};
