"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowDown, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatEther, formatUnits, isAddress, zeroAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTokenWrapper } from "@/hooks/useTokenWrapper";
import { Link } from "@/i18n/navigation";
import { parseWrapperAmount, wrapperAction } from "@/lib/token-wrapper";
import type { Config } from "@/types/config";

import type { Address } from "viem";

interface TokenManagementProps {
  config: Config;
  renderTrigger?: (open: () => void) => React.ReactNode;
}

export function TokenManagement({ config, renderTrigger }: TokenManagementProps) {
  const t = useTranslations("profile.tokenManagement");
  const { address: account, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const wrapper = useTokenWrapper(config);
  const { values, phase, completed, error, hash, clear, estimate } = wrapper;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"wrap" | "unwrap">("wrap");
  const [input, setInput] = useState("");
  const [delegatee, setDelegatee] = useState("");
  const [fee, setFee] = useState<bigint>();
  const [networkError, setNetworkError] = useState("");
  const busy = phase !== "idle";
  const correctChain = chainId === config.chain.id;
  const amount = values ? parseWrapperAmount(input, values.decimals) : null;
  const balance = values ? mode === "wrap" ? values.underlyingBalance : values.balance : undefined;
  const insufficient = amount !== null && balance !== undefined && amount > balance;
  const valid = amount !== null && !insufficient && Boolean(values);
  const action = wrapperAction(mode, amount ?? 0n, values?.allowance ?? 0n);
  const fromSymbol = mode === "wrap" ? values?.underlyingSymbol : values?.symbol;
  const toSymbol = mode === "wrap" ? values?.symbol : values?.underlyingSymbol;
  const success = completed === "wrap" || completed === "unwrap" || completed === "delegate";
  const display = (value: bigint) => formatUnits(value, values?.decimals ?? 18);
  const explorer = config.chain.explorers?.[0];

  useEffect(() => {
    let active = true;
    setFee(undefined);
    if (!open || !valid || !amount || !correctChain || busy || success) return;
    const timer = setTimeout(() => {
      void estimate(action, amount).then((result) => {
        if (active) setFee(result);
      }).catch(() => { if (active) setFee(undefined); });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [open, valid, amount, action, correctChain, busy, success, estimate]);

  const changeOpen = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    if (next) { clear(); setInput(""); setDelegatee(""); setNetworkError(""); }
  };

  const primary = async () => {
    setNetworkError("");
    if (!isConnected) { openConnectModal?.(); return; }
    if (!correctChain) {
      try { await switchChainAsync({ chainId: config.chain.id }); }
      catch { setNetworkError(t("switchFailed")); }
      return;
    }
    if (valid && amount) await wrapper.execute(action, amount);
  };

  return (
    <>
      {renderTrigger ? renderTrigger(() => changeOpen(true)) : <Button
        variant="ghost"
        size="sm"
        className="h-auto w-max justify-start p-0 text-xs font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
        onClick={() => changeOpen(true)}
      >
        {t("manage")}
      </Button>}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[14px] border-border/20 bg-card p-5">
          <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0 text-left">
            <div className="space-y-2">
              <DialogTitle>{t(success ? "complete" : "title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </div>
            <Button variant="ghost" size="icon" aria-label={t("close")} disabled={busy} onClick={() => changeOpen(false)}><X /></Button>
          </DialogHeader>
          {wrapper.unavailable ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm">{t("unavailable")}</p>
              <Button variant="outline" onClick={() => void wrapper.refresh()}>{t("retry")}</Button>
            </div>
          ) : !values ? <p role="status">{t("loading")}</p> : success ? (
            <div className="space-y-4">
              <Check className="size-8 text-primary" aria-hidden="true" />
              <p role="status">{t(completed === "wrap" ? "wrapped" : completed === "unwrap" ? "unwrapped" : "delegated")}</p>
              <p className="text-sm tabular-nums">{display(values.underlyingBalance)} {values.underlyingSymbol} · {display(values.balance)} {values.symbol}</p>
              {completed === "wrap" && values.delegate.toLowerCase() === zeroAddress ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t("delegationHint")}</p>
                  <Button className="w-full rounded-full" disabled={busy || !correctChain} onClick={() => void wrapper.execute("delegate", 0n, account)}>{t("voteMyself")}</Button>
                  <label htmlFor="wrapper-delegate" className="block text-sm">{t("delegateAddress")}</label>
                  <Input id="wrapper-delegate" value={delegatee} disabled={busy} onChange={(event) => setDelegatee(event.target.value)} placeholder="0x…" autoComplete="off" />
                  <Button variant="outline" className="w-full rounded-full" disabled={busy || !correctChain || !isAddress(delegatee) || delegatee.toLowerCase() === zeroAddress} onClick={() => void wrapper.execute("delegate", 0n, delegatee as Address)}>{t("delegate")}</Button>
                  <Link href="/delegates" className="block text-sm underline underline-offset-4" onClick={(event) => { if (busy) event.preventDefault(); }}>{t("browseDelegates")}</Link>
                </div>
              ) : completed === "wrap" ? <p className="break-all text-sm text-muted-foreground">{t("existingDelegate", { address: values.delegate })}</p> : null}
              <p className="text-sm text-muted-foreground">{t("snapshot")}</p>
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => changeOpen(false)}>{t("back")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div role="group" aria-label={t("operation")} className="flex gap-2">
                {(["wrap", "unwrap"] as const).map((tab) => <Button key={tab} variant={mode === tab ? "default" : "outline"} aria-pressed={mode === tab} disabled={busy} className="flex-1 rounded-full" onClick={() => { setMode(tab); setInput(""); clear(); }}>{t(tab)}</Button>)}
              </div>
              <p className="text-sm text-muted-foreground">{config.chain.name}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <label htmlFor="wrapper-amount">{t("pay", { symbol: fromSymbol ?? "" })}</label>
                  <button type="button" className="underline underline-offset-4 disabled:opacity-50" disabled={busy || balance === undefined || balance === 0n} onClick={() => { if (balance !== undefined) { setInput(display(balance)); clear(); } }}>{t("max")}</button>
                </div>
                <Input id="wrapper-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={input} disabled={busy} aria-describedby="wrapper-amount-help" aria-invalid={Boolean(input && (!amount || insufficient))} onChange={(event) => { setInput(event.target.value); clear(); }} />
                <p className="break-words text-sm text-muted-foreground tabular-nums">{t("balance", { amount: display(balance ?? 0n), symbol: fromSymbol ?? "" })}</p>
                <p id="wrapper-amount-help" role="status" className="text-sm text-destructive">{input && !amount ? t("invalidAmount", { decimals: values.decimals }) : insufficient ? t("insufficient", { symbol: fromSymbol ?? "" }) : null}</p>
              </div>
              <ArrowDown className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
              <p className="break-words text-lg font-semibold tabular-nums">{t("receive", { amount: amount ? display(amount) : "0", symbol: toSymbol ?? "" })}</p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt>{t("rate")}</dt><dd>1 {values.underlyingSymbol} = 1 {values.symbol}</dd></div>
                <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{t("recipient")}</dt><dd className="break-all">{account}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t("fee")}</dt><dd>{fee !== undefined ? `${formatEther(fee)} ${config.chain.nativeToken.symbol}` : t("feeUnavailable")}</dd></div>
              </dl>
              <p className="text-sm text-muted-foreground">{t(mode === "unwrap" ? "unwrapHint" : action === "approve" ? "approveHint" : "wrapHint")}</p>
              <Button className="w-full rounded-full" disabled={busy || switching || (isConnected && correctChain && !valid)} onClick={() => void primary()}>
                {busy ? t(phase) : !isConnected ? t("connect") : !correctChain ? t("switchNetwork") : t(action)}
              </Button>
            </div>
          )}
          <div className="space-y-2 text-sm" aria-live="polite">
            {busy && <p role="status">{t(phase)}</p>}
            {completed === "approve" && <p role="status">{t("approved")}</p>}
            {(error || networkError) && <p role="alert" className="break-words text-destructive">{error || networkError}</p>}
            {hash && explorer && <a className="underline underline-offset-4" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">{t("viewTransaction")}</a>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
