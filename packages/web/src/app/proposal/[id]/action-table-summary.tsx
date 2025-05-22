import Image from "next/image";
import { useMemo } from "react";

import { CustomTable } from "@/components/custom-table";
import type { ColumnType } from "@/components/custom-table";
import { PROPOSAL_ACTIONS, PROPOSAL_ACTIONS_LIGHT } from "@/config/proposals";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { formatFunctionSignature } from "@/utils";
import { formatShortAddress } from "@/utils/address";
import { formatBigIntForDisplay } from "@/utils/number";

import type { Action } from "./action-table-raw";

interface ActionTableSummaryProps {
  actions: Action[];
  isLoading?: boolean;
}

export function ActionTableSummary({
  actions,
  isLoading = false,
}: ActionTableSummaryProps) {
  const daoConfig = useDaoConfig();

  const data = useMemo(() => {
    return actions.map((action) => {
      const isXAccount =
        action?.signature ===
        "send(uint256 toChainId, address toDapp, bytes calldata message, bytes calldata params) external payable";
      const type =
        action?.calldata === "0x"
          ? "transfer"
          : isXAccount
          ? "xAccount"
          : "custom";

      let details = "";
      if (type === "transfer") {
        details = `${formatBigIntForDisplay(
          action?.value ? BigInt(action?.value) : BigInt(0),
          daoConfig?.chain?.nativeToken?.decimals ?? 18
        )} ${daoConfig?.chain?.nativeToken?.symbol}`;
      } else {
        details = action?.signature
          ? formatFunctionSignature(action?.signature)
          : "";
      }

      return {
        ...action,
        type,
        details,
      };
    });
  }, [actions, daoConfig]);

  const columns = useMemo<ColumnType<(typeof data)[0]>[]>(
    () => [
      {
        title: "Type",
        key: "type",
        width: "33%",
        className: "text-left",
        render: (record) => (
          <div className="flex items-center gap-[10px]">
            <Image
              src={
                PROPOSAL_ACTIONS_LIGHT[
                  record.type?.toLowerCase() as keyof typeof PROPOSAL_ACTIONS_LIGHT
                ]
              }
              alt={record.type}
              width={24}
              height={24}
              className="rounded-full block dark:hidden"
            />
            <Image
              src={
                PROPOSAL_ACTIONS[
                  record.type?.toLowerCase() as keyof typeof PROPOSAL_ACTIONS
                ]
              }
              alt={record.type}
              width={24}
              height={24}
              className="rounded-full hidden dark:block"
            />
            <span className="text-[14px] capitalize">
              {record.type === "xAccount"
                ? "XAccount Cross-chain"
                : record.type}
            </span>
          </div>
        ),
      },
      {
        title: "Address Data",
        key: "target",
        width: "33%",
        className: "text-left",
        render: (record) => (
          <a
            href={`${daoConfig?.chain?.explorers?.[0]}/address/${record.target}`}
            className="flex items-center gap-[10px] transition-opacity hover:opacity-80"
            target="_blank"
            rel="noreferrer"
          >
            <span className="font-mono">
              {formatShortAddress(record.target)}
            </span>
            <Image
              src="/assets/image/light/external-link.svg"
              alt="external-link"
              width={16}
              height={16}
              className="dark:hidden"
            />
            <Image
              src="/assets/image/external-link.svg"
              alt="external-link"
              width={16}
              height={16}
              className="hidden dark:block"
            />
          </a>
        ),
      },
      {
        title: "Details",
        key: "details",
        width: "33%",
        className: "text-left truncate",
        style: { wordWrap: "break-word" },
        render: (record) => (
          <div className="truncate" title={record.details}>
            {record.details}
          </div>
        ),
      },
    ],
    [daoConfig]
  );

  return (
    <CustomTable
      columns={columns}
      tableClassName="table-fixed"
      dataSource={data}
      rowKey={(record) => `${record.target}-${record.calldata}`}
      isLoading={isLoading}
      emptyText="No Actions"
      loadingRows={3}
    />
  );
}
