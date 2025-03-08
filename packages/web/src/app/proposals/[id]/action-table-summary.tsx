import Image from "next/image";
import { useMemo } from "react";

import { Empty } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROPOSAL_ACTIONS } from "@/config/proposals";
import { useConfig } from "@/hooks/useConfig";
import { formatFunctionSignature } from "@/utils";
import { formatShortAddress } from "@/utils/address";
import { formatBigIntForDisplay } from "@/utils/number";

import type { Action } from "./action-table-raw";

interface ActionTableSummaryProps {
  actions: Action[];
}

export function ActionTableSummary({ actions }: ActionTableSummaryProps) {
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
  return (
    <>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3 rounded-l-[14px] text-left">
              Type
            </TableHead>
            <TableHead className="w-1/3 text-left">Address Data</TableHead>
            <TableHead className="w-1/3 rounded-r-[14px] text-left">
              Details
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {data?.map((value) => (
            <TableRow key={value.target + "-" + value.calldata}>
              <TableCell className="text-left">
                <div className="flex items-center gap-[10px]">
                  <Image
                    src={
                      PROPOSAL_ACTIONS[
                        value.type as keyof typeof PROPOSAL_ACTIONS
                      ]
                    }
                    alt={value.type}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="text-[14px] capitalize">{value.type}</span>
                </div>
              </TableCell>

              <TableCell className="text-left">
                <a
                  href={`${daoConfig?.network?.explorer?.[0]}/address/${value?.target}`}
                  className="flex items-center gap-[10px] transition-opacity hover:opacity-80"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{formatShortAddress(value?.target)}</span>
                  <Image
                    src="/assets/image/external-link.svg"
                    alt="external-link"
                    width={16}
                    height={16}
                  />
                </a>
              </TableCell>

              <TableCell
                className="text-left truncate"
                style={{ wordWrap: "break-word" }}
                title={value.details}
              >
                {value.details}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data?.length && <Empty label="No Addresses" className="h-[400px]" />}
    </>
  );
}
