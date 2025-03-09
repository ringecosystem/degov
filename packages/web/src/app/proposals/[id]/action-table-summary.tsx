import Image from "next/image";
import { useMemo } from "react";

import { CustomTable } from "@/components/custom-table";
import type { ColumnType } from "@/components/custom-table";
import { PROPOSAL_ACTIONS } from "@/config/proposals";
import { useConfig } from "@/hooks/useConfig";
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
  const daoConfig = useConfig();

  const data = useMemo(() => {
    return actions.map((action) => {
      const type = action?.calldata === "0x" ? "transfer" : "custom";

      let details = "";
      if (type === "transfer") {
        details = `${formatBigIntForDisplay(
          action?.value ? BigInt(action?.value) : BigInt(0),
          daoConfig?.network?.nativeToken?.decimals ?? 18
        )} ${daoConfig?.network?.nativeToken?.symbol}`;
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
                PROPOSAL_ACTIONS[record.type as keyof typeof PROPOSAL_ACTIONS]
              }
              alt={record.type}
              width={24}
              height={24}
              className="rounded-full"
            />
            <span className="text-[14px] capitalize">{record.type}</span>
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
            href={`${daoConfig?.network?.explorer?.[0]}/address/${record.target}`}
            className="flex items-center gap-[10px] transition-opacity hover:opacity-80"
            target="_blank"
            rel="noreferrer"
          >
            <span className="font-mono">
              {formatShortAddress(record.target)}
            </span>
            <Image
              src="/assets/image/external-link.svg"
              alt="external-link"
              width={16}
              height={16}
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
