"use client";

import { Check, CircleAlert, ExternalLink, Vote } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import NotFound from "@/components/not-found";
import { Button } from "@/components/ui/button";
import { playgroundFaucetAbi } from "@/config/abi/playground-faucet";
import { abi as tokenAbi } from "@/config/abi/token";
import { useConnectWalletStatus } from "@/hooks/useConnectWalletStatus";
import { useContractGuard } from "@/hooks/useContractGuard";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useDelegate } from "@/hooks/useDelegate";
import {
  getPlaygroundFaucetAddress,
  PLAYGROUND_DAO_CODE,
} from "@/utils/playground-faucet";

import type { BaseError } from "viem";

function TransactionLink({ hash }: { hash: `0x${string}` }) {
  const daoConfig = useDaoConfig();
  const t = useTranslations("faucet");
  const explorer = daoConfig?.chain?.explorers?.[0];

  if (!explorer) return null;

  return (
    <a
      href={`${explorer}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4"
    >
      {t("viewTransaction")}
      <ExternalLink aria-hidden="true" className="size-4" />
    </a>
  );
}

function getErrorMessage(error: Error | null): string | undefined {
  if (!error) return undefined;
  return (error as BaseError).shortMessage ?? error.message;
}

export default function FaucetPage() {
  const t = useTranslations("faucet");
  const daoConfig = useDaoConfig();
  const faucetAddress = getPlaygroundFaucetAddress(daoConfig);
  const { address } = useAccount();
  const { isConnected, isCorrectNetwork, errorMessage } =
    useConnectWalletStatus();
  const { validateBeforeExecution } = useContractGuard();
  const { delegate, isPending: isDelegating } = useDelegate();
  const [claimHash, setClaimHash] = useState<`0x${string}`>();
  const [claimErrorState, setClaimErrorState] = useState<string>();
  const [delegateHash, setDelegateHash] = useState<`0x${string}`>();
  const [delegateError, setDelegateError] = useState<string>();

  const {
    data: hasClaimed,
    isLoading: isLoadingClaim,
    refetch: refetchClaimed,
  } = useReadContract({
    address: faucetAddress,
    abi: playgroundFaucetAbi,
    functionName: "claimed",
    args: address ? [address] : undefined,
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: Boolean(faucetAddress && address),
    },
  });

  const { data: currentDelegate, refetch: refetchDelegate } = useReadContract({
    address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
    abi: tokenAbi,
    functionName: "delegates",
    args: address ? [address] : undefined,
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: Boolean(address && hasClaimed),
    },
  });

  const {
    writeContractAsync,
    isPending: isPreparingClaim,
    error: claimWriteError,
    reset: resetClaim,
  } = useWriteContract();
  const claimReceipt = useWaitForTransactionReceipt({
    hash: claimHash,
    query: { enabled: Boolean(claimHash) },
  });
  const delegateReceipt = useWaitForTransactionReceipt({
    hash: delegateHash,
    query: { enabled: Boolean(delegateHash) },
  });

  useEffect(() => {
    if (claimReceipt.isSuccess) void refetchClaimed();
  }, [claimReceipt.isSuccess, refetchClaimed]);

  useEffect(() => {
    if (delegateReceipt.isSuccess) void refetchDelegate();
  }, [delegateReceipt.isSuccess, refetchDelegate]);

  if (daoConfig?.code !== PLAYGROUND_DAO_CODE) return <NotFound />;

  const claimComplete = Boolean(hasClaimed || claimReceipt.isSuccess);
  const isSelfDelegated =
    Boolean(address) &&
    (delegateReceipt.isSuccess ||
      (typeof currentDelegate === "string" &&
        currentDelegate.toLowerCase() === address?.toLowerCase()));
  const claimError =
    claimErrorState ??
    getErrorMessage((claimWriteError ?? claimReceipt.error) as Error | null);
  const displayedDelegateError =
    delegateError ?? getErrorMessage(delegateReceipt.error as Error | null);

  const handleClaim = async () => {
    if (!faucetAddress || !validateBeforeExecution()) return;

    resetClaim();
    setClaimErrorState(undefined);
    setClaimHash(undefined);
    try {
      const hash = await writeContractAsync({
        address: faucetAddress,
        abi: playgroundFaucetAbi,
        functionName: "claim",
        chainId: daoConfig.chain.id,
      });
      setClaimHash(hash);
    } catch (error) {
      setClaimErrorState(getErrorMessage(error as Error));
    }
  };

  const handleSelfDelegate = async () => {
    if (!address) return;

    setDelegateError(undefined);
    setDelegateHash(undefined);
    try {
      const hash = await delegate(address);
      if (hash) setDelegateHash(hash);
    } catch (error) {
      setDelegateError(getErrorMessage(error as Error));
    }
  };

  const claimButtonLabel = !isConnected
    ? t("connectWallet")
    : !isCorrectNetwork
      ? t("switchNetwork", { network: daoConfig.chain.name })
      : claimComplete
        ? t("claimed")
        : t("claim");

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 py-4 sm:py-8">
      <header className="max-w-[65ch] space-y-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
          {t("title")}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <section className="rounded-[14px] bg-card p-5 shadow-card sm:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-card">
              {claimComplete ? (
                <Check aria-hidden="true" className="size-5" />
              ) : (
                <span className="font-bold">1</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-lg font-bold">{t("claimTitle")}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("claimDescription")}
              </p>
              {!faucetAddress && (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {t("notConfigured")}
                </p>
              )}
              {errorMessage && isConnected && (
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              )}
              {claimError && (
                <p role="alert" className="text-sm text-destructive">
                  {claimError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button
                  onClick={() => void handleClaim()}
                  disabled={
                    !faucetAddress ||
                    claimComplete ||
                    isLoadingClaim ||
                    claimReceipt.isPending
                  }
                  isLoading={isPreparingClaim || claimReceipt.isPending}
                  className="min-w-[160px]"
                >
                  {claimButtonLabel}
                </Button>
                {claimHash && <TransactionLink hash={claimHash} />}
              </div>
            </div>
          </div>

          <div className="ml-5 h-8 border-l border-dashed border-muted-foreground/40" />

          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              {isSelfDelegated ? (
                <Check aria-hidden="true" className="size-5" />
              ) : (
                <Vote aria-hidden="true" className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-lg font-bold">{t("delegateTitle")}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("delegateDescription")}
              </p>
              {displayedDelegateError && (
                <p role="alert" className="text-sm text-destructive">
                  {displayedDelegateError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button
                  variant="outline"
                  onClick={() => void handleSelfDelegate()}
                  disabled={!claimComplete || isSelfDelegated || !address}
                  isLoading={isDelegating || delegateReceipt.isPending}
                >
                  {isSelfDelegated ? t("delegated") : t("delegate")}
                </Button>
                {delegateHash && <TransactionLink hash={delegateHash} />}
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="flex items-start gap-3 border-t pt-5 text-sm leading-6 text-muted-foreground">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>{t("gasNotice")}</p>
      </aside>
    </main>
  );
}
