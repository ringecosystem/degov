"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowDown, Check, Coins, Globe2, Info, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatEther, formatUnits, isAddress, zeroAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTokenWrapper } from "@/hooks/useTokenWrapper";
import { Link } from "@/i18n/navigation";
import { parseWrapperAmount, type readWrapperValues, wrapperAction } from "@/lib/token-wrapper";
import type { Config } from "@/types/config";

import styles from "./token-management.module.css";

import type { Address } from "viem";

interface TokenManagementProps {
  config: Config;
  renderTrigger?: (open: () => void, values: ReturnType<typeof readWrapperValues>, unavailable: boolean) => React.ReactNode;
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
    if (next) { setMode("wrap"); clear(); setInput(""); setDelegatee(""); setNetworkError(""); }
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
      {renderTrigger ? renderTrigger(() => changeOpen(true), values, wrapper.unavailable) : <Button
        variant="ghost"
        size="sm"
        className="h-auto w-max justify-start p-0 text-xs font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
        onClick={() => changeOpen(true)}
      >
        {t("manage")}
      </Button>}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className={styles.dialog} overlayClassName="bg-black/25 backdrop-blur-sm">
          <DialogHeader className={styles.header}>
            <div>
              <DialogTitle className={styles.title}>{t(success ? completed === "wrap" ? "wrapComplete" : completed === "unwrap" ? "unwrapComplete" : "complete" : "title")}</DialogTitle>
              <DialogDescription className={styles.description}>{t("description")}</DialogDescription>
            </div>
            <Button variant="ghost" size="icon" className={styles.close} aria-label={t("close")} disabled={busy} onClick={() => changeOpen(false)}><X size={22} /></Button>
          </DialogHeader>
          {wrapper.unavailable ? (
            <div className={styles.state}>
              <p role="alert">{t("unavailable")}</p>
              <Button variant="outline" onClick={() => void wrapper.refresh()}>{t("retry")}</Button>
            </div>
          ) : !values ? <p role="status" className={styles.state}>{t("loading")}</p> : busy ? (
            <div className={styles.state} role="status">
              <LoaderCircle className="size-10 animate-spin" aria-hidden="true" />
              <h3 className={styles.stateTitle}>{t(phase)}</h3>
              <p className={styles.description}>{t(phase === "signing" ? "walletHint" : "confirmingHint")}</p>
            </div>
          ) : success ? (
            <div className={styles.success}>
              <div className={styles.successIcon}><Check size={30} aria-hidden="true" /></div>
              <h3 className={styles.stateTitle}>{completed === "delegate" ? t("delegated") : t(completed === "wrap" ? "wrappedTitle" : "unwrappedTitle", { symbol: completed === "wrap" ? values.symbol : values.underlyingSymbol })}</h3>
              <p role="status" className="sr-only">{t(completed === "wrap" ? "wrapped" : completed === "unwrap" ? "unwrapped" : "delegated")}</p>
              {completed !== "delegate" && <div className={styles.resultAmount}><TokenBadge symbol={completed === "wrap" ? values.symbol : values.underlyingSymbol} wrapped={completed === "wrap"} />{input}</div>}
              <dl className={styles.balances}>
                <div><dt>{t("tokenBalance", { symbol: values.underlyingSymbol })}</dt><dd>{display(values.underlyingBalance)} {values.underlyingSymbol}</dd></div>
                <div><dt>{t("tokenBalance", { symbol: values.symbol })}</dt><dd>{display(values.balance)} {values.symbol}</dd></div>
              </dl>
              {completed === "wrap" && values.delegate.toLowerCase() === zeroAddress ? (
                <div className={styles.participation}>
                  <h4>{t("chooseParticipation")}</h4>
                  <p>{t("delegationHint")}</p>
                  <Button className="w-full rounded-full" disabled={!correctChain} onClick={() => void wrapper.execute("delegate", 0n, account)}>{t("voteMyself")}</Button>
                  <label htmlFor="wrapper-delegate">{t("delegateAddress")}</label>
                  <Input id="wrapper-delegate" value={delegatee} onChange={(event) => setDelegatee(event.target.value)} placeholder="0x…" autoComplete="off" />
                  <Button variant="outline" className="w-full rounded-full" disabled={!correctChain || !isAddress(delegatee) || delegatee.toLowerCase() === zeroAddress} onClick={() => void wrapper.execute("delegate", 0n, delegatee as Address)}>{t("delegate")}</Button>
                  <Link href="/delegates" className="underline underline-offset-4">{t("browseDelegates")}</Link>
                </div>
              ) : completed === "wrap" ? <p className={styles.explanation}>{t("existingDelegate", { address: values.delegate })}</p> : null}
              <p className={styles.explanation}>{t("snapshot")}</p>
              <Button className={styles.primary} onClick={() => changeOpen(false)}>{t("back")}</Button>
              <Button variant="ghost" className="w-full" onClick={() => { clear(); setInput(""); }}>{t("manageMore")}</Button>
            </div>
          ) : (
            <div className={styles.form}>
              <div role="tablist" aria-label={t("operation")} className={styles.tabs}>
                {(["wrap", "unwrap"] as const).map((tab) => <button
                  key={tab} id={`wrapper-tab-${tab}`} role="tab" type="button" aria-selected={mode === tab} aria-controls="wrapper-operation" tabIndex={mode === tab ? 0 : -1}
                  onClick={() => { setMode(tab); setInput(""); clear(); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      const next = tab === "wrap" ? "unwrap" : "wrap";
                      setMode(next); setInput(""); clear();
                      document.getElementById(`wrapper-tab-${next}`)?.focus();
                    }
                  }}
                >{t(tab)}</button>)}
              </div>
              <div id="wrapper-operation" role="tabpanel" aria-labelledby={`wrapper-tab-${mode}`}>
                <div className={styles.network}>
                  <span><Globe2 size={16} aria-hidden="true" />{config.chain.name}</span>
                  <span>1 {values.underlyingSymbol} = 1 {values.symbol}</span>
                </div>
                {mode === "wrap" && <ol className={styles.steps} aria-label={t("wrapProgress")}>
                  {(["approveStep", "wrap", "delegateStep"] as const).map((step, index) => {
                    const approved = valid && action !== "approve";
                    const done = index === 0 && approved || index === 2 && values.delegate.toLowerCase() !== zeroAddress;
                    const active = index === (approved ? 1 : 0);
                    return <li key={step} data-active={active} data-complete={done}><span>{done ? <Check size={12} /> : index + 1}</span>{t(step)}{index === 2 && <small>{t("optional")}</small>}</li>;
                  })}
                </ol>}
                <div className={styles.amountBlock}>
                  <div className={styles.amountLabel}>
                    <label htmlFor="wrapper-amount">{t(mode === "wrap" ? "youWrap" : "youUnwrap")}</label>
                    <span>{t("balance", { amount: display(balance ?? 0n), symbol: "" })}<button type="button" disabled={balance === undefined || balance === 0n} onClick={() => { if (balance !== undefined) { setInput(display(balance)); clear(); } }}>{t("max")}</button></span>
                  </div>
                  <div className={styles.amountRow}>
                    <input id="wrapper-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={input} aria-describedby="wrapper-amount-help" aria-invalid={Boolean(input && (!amount || insufficient))} onChange={(event) => { setInput(event.target.value); clear(); }} />
                    <TokenBadge symbol={fromSymbol ?? ""} wrapped={mode === "unwrap"} />
                  </div>
                </div>
                <div className={styles.exchange}><ArrowDown size={18} aria-hidden="true" /></div>
                <div className={styles.receiveBlock}>
                  <span>{t("youReceive")}</span>
                  <div className={styles.amountRow}><strong>{amount ? display(amount) : "0.00"}</strong><TokenBadge symbol={toSymbol ?? ""} wrapped={mode === "wrap"} /></div>
                </div>
                <p id="wrapper-amount-help" role="status" className={styles.formError}>{input && !amount ? t("invalidAmount", { decimals: values.decimals }) : insufficient ? t("insufficient", { symbol: fromSymbol ?? "" }) : null}</p>
                <dl className={styles.details}>
                  <div><dt>{t("receivingAccount")}</dt><dd title={account}>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "—"}</dd></div>
                  <div><dt>{t("networkFee")}</dt><dd>{fee !== undefined ? t("networkFeeTransaction", { amount: formatEther(fee), symbol: config.chain.nativeToken.symbol }) : t("feeUnavailable")}</dd></div>
                  <div><dt>{t(mode === "wrap" ? "transactionsWrap" : "transactionsUnwrap")}</dt><dd>{mode === "unwrap" ? t("oneTransaction") : !amount ? t("approveThenWrap") : action === "approve" ? t("twoTransactions") : t("oneTransaction")}</dd></div>
                </dl>
                <div className={styles.explanation}><Info size={15} aria-hidden="true" /><p>{t(mode === "unwrap" ? "unwrapHint" : values.delegate.toLowerCase() !== zeroAddress ? "wrapHint" : "participateHint")}</p></div>
                <Button className={styles.primary} disabled={switching || (isConnected && correctChain && !valid)} onClick={() => void primary()}>
                  {!isConnected ? t("connect") : !correctChain ? t("switchNetwork") : !input ? t("enterAmount") : t(action)}
                </Button>
                <p className={styles.footnote}>{t(mode === "wrap" ? "approvalFootnote" : "unwrapFootnote")}</p>
              </div>
            </div>
          )}
          <div className={styles.feedback} aria-live="polite">
            {!busy && completed === "approve" && <p role="status">{t("approved")}</p>}
            {(error || networkError) && <p role="alert" className="break-words text-destructive">{error || networkError}</p>}
            {hash && explorer && <a className="underline underline-offset-4" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">{t("viewTransaction")}</a>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TokenBadge({ symbol, wrapped }: { symbol: string; wrapped: boolean }) {
  return <span className={styles.tokenBadge}><span className={styles.tokenIcon}>
    <Coins size={24} aria-hidden="true" />
    {wrapped && <small>{"w"}</small>}
  </span>{symbol}</span>;
}
