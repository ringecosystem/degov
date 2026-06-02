"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";

import { AvatarIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface WithConnectProps {
  children: React.ReactNode;
}
export function WithConnect({ children }: WithConnectProps) {
  const t = useTranslations("common.connect");
  const { address } = useAccount();

  const { openConnectModal } = useConnectModal();

  if (!address) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-[20px] -mt-[100px]">
          <AvatarIcon width={70} height={70} />
          <p className="text-[14px]">
            {t("exploreFeatures")}
          </p>
          <Button className="rounded-full" onClick={openConnectModal}>
            {t("connectWallet")}
          </Button>
        </div>
      </div>
    );
  }

  return children;
}
