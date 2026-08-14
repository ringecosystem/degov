import { useTranslations } from "next-intl";

import type { ProposalSimulationResult } from "@/services/proposal-simulation";

const itemCount = (items?: unknown[]) => (items?.length ? items.length : 0);

export function ProposalSimulationResult({
  result,
  error,
  hasXAccountAction,
}: {
  result: ProposalSimulationResult | null;
  error: Error | null;
  hasXAccountAction: boolean;
}) {
  const t = useTranslations("proposalDetail.simulation");

  if (!result && !error && !hasXAccountAction) return null;

  const reverted = result?.status === "reverted";
  const reason = result?.revert?.reason;
  const richCounts = result
    ? [
        itemCount(result.calls)
          ? t("calls", { count: itemCount(result.calls) })
          : null,
        itemCount(result.logs)
          ? t("logs", { count: itemCount(result.logs) })
          : null,
        itemCount(result.assetChanges)
          ? t("assetChanges", { count: itemCount(result.assetChanges) })
          : null,
        itemCount(result.stateChanges)
          ? t("stateChanges", { count: itemCount(result.stateChanges) })
          : null,
      ].filter(Boolean)
    : [];

  return (
    <div
      className="max-w-[520px] rounded-[14px] bg-card p-[12px] text-[12px] leading-[1.5] shadow-card"
      aria-live="polite"
    >
      {hasXAccountAction && (
        <p className="text-warning">{t("xAccountWarning")}</p>
      )}
      {error && (
        <p className="mt-[6px] text-danger break-words">
          {t("requestFailed", { message: error.message })}
        </p>
      )}
      {result && (
        <div className="mt-[6px] flex flex-col gap-[6px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span
              className={
                reverted
                  ? "rounded-[100px] bg-danger/10 px-[10px] py-[2px] text-danger"
                  : "rounded-[100px] bg-success/10 px-[10px] py-[2px] text-success"
              }
            >
              {reverted ? t("reverted") : t("success")}
            </span>
            <span className="rounded-[100px] bg-card-background px-[10px] py-[2px]">
              {result.fidelity === "rich"
                ? t("richFidelity")
                : t("limitedFidelity")}
            </span>
          </div>
          <p className="break-words">
            {t("gas", { gas: result.gasUsed ? String(result.gasUsed) : "-" })}
            {reason ? ` ${t("reason", { reason })}` : ""}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-[8px] break-all text-text-secondary">
            <dt>{t("provider")}</dt>
            <dd>{result.provider ?? "-"}</dd>
            <dt>{t("chain")}</dt>
            <dd>{result.chainId ?? "-"}</dd>
            <dt>{t("block")}</dt>
            <dd>{result.blockNumber ?? "-"}</dd>
            <dt>{t("caller")}</dt>
            <dd>{result.caller ?? "-"}</dd>
            <dt>{t("simulatedAt")}</dt>
            <dd>
              {result.simulatedAt
                ? new Date(result.simulatedAt).toLocaleString()
                : "-"}
            </dd>
          </dl>
          {richCounts.length > 0 && (
            <p className="break-words">{richCounts.join(" · ")}</p>
          )}
          {result.warnings?.length ? (
            <p className="break-words text-warning">
              {result.warnings.join(" ")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
