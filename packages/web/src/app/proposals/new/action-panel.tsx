import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useMemo, useState } from "react";
import { isAddress, parseUnits } from "viem";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { formatShortAddress } from "@/utils/address";

import type { Action } from "./type";
import type { Address } from "viem";

export interface ActionPanelInfo {
  type: string;
  address?: Address;
  value?: string;
  details?: string;
  params?: { name: string; value: string | string[] }[];
  signature?: string;
  calldata?: { name: string; value: string | string[] }[];
}
interface ActionsPanelProps {
  actions: Action[];
}

export const ActionsPanel = ({ actions }: ActionsPanelProps) => {
  const daoConfig = useConfig();

  const [tab, setTab] = useState<"raw" | "summary">("summary");
  const [openParams, setOpenParams] = useState<number[]>([]);

  const toggleParams = (index: number) => {
    setOpenParams((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const actionPanelInfo = useMemo<ActionPanelInfo[]>(() => {
    return actions
      ?.filter((action) => action.type !== "proposal")
      ?.filter((action) => {
        switch (action.type) {
          case "transfer":
            return (
              !!action.content.recipient && isAddress(action.content.recipient)
            );
          case "custom":
            const condition = [
              !!action.content.target,
              isAddress(action.content.target),
              !!action.content.contractMethod,
              !!action.content.calldata,
              action?.content.calldata?.length,
            ];
            return condition.every((item) => item);
          default:
            return true;
        }
      })
      .map((action) => {
        const info: ActionPanelInfo = {
          type: action.type,
        };
        switch (action.type) {
          case "transfer":
            info.address = action.content.recipient;
            info.value = action.content.amount ?? "0";
            info.details = `${action.content.amount} ${daoConfig?.network?.nativeToken?.symbol}`;
            break;
          case "custom":
            const contractMethod = action?.content?.contractMethod
              ? action?.content?.contractMethod?.split("-")[0]
              : "";
            info.address = action.content.target;
            info.value = action.content.value ?? "0";
            info.details = contractMethod;
            info.params = action?.content?.calldata?.map((item) => ({
              name: item.name,
              value: item.value,
            }));
            info.signature = `${contractMethod}(${action?.content?.calldata
              ?.map((item) => `${item.name}`)
              .join(",")})`;

            info.calldata = action?.content?.calldata?.map((item) => {
              return {
                name: item.type,
                value: item.value,
              };
            });

            break;
        }
        return info;
      });
  }, [actions, daoConfig]);

  const SummaryView = () => {
    const daoConfig = useConfig();
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3 rounded-l-[14px] px-[10px] text-left">
              Type
            </TableHead>
            <TableHead className="w-1/3 px-[10px] text-left">
              Address Data
            </TableHead>
            <TableHead className="w-1/3 rounded-r-[14px] px-[10px] text-left">
              Details
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:has(+tr[data-expanded])]:border-0">
          {actionPanelInfo?.map((action, index) => (
            <Fragment key={index}>
              <TableRow>
                <TableCell className="w-1/3 text-left">
                  <div className="flex items-center gap-[10px]">
                    <Image
                      src={
                        PROPOSAL_ACTIONS[
                          action.type as keyof typeof PROPOSAL_ACTIONS
                        ]
                      }
                      alt={action.type || ""}
                      className="h-[24px] w-[24px] rounded-full"
                      width={24}
                      height={24}
                    />
                    <span className="text-[14px] capitalize">
                      {action.type}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="w-1/3 text-left">
                  {action.address ? (
                    <a
                      href={`${daoConfig?.network?.explorer?.[0]}/address/${action.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-[5px] hover:underline font-mono"
                    >
                      {action.address
                        ? formatShortAddress(action.address)
                        : "No address"}
                      <Image
                        src="/assets/image/external-link.svg"
                        alt="external-link"
                        width={16}
                        height={16}
                      />
                    </a>
                  ) : (
                    <span className="text-muted-foreground"></span>
                  )}
                </TableCell>
                <TableCell className="w-1/3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span>{action.details}</span>
                    {action?.params?.length && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleParams(index)}
                        className="text-[14px] text-foreground/40"
                      >
                        {action?.params?.length} params
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            openParams.includes(index) && "rotate-180"
                          )}
                        />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {action.params && openParams.includes(index) && (
                <TableRow data-expanded className="border-t-0">
                  <TableCell colSpan={3} className="pt-0">
                    {action.params.map((param, pIndex) => (
                      <div key={pIndex} className="flex gap-2">
                        <span className="font-medium">{param.name}:</span>
                        <span
                          className="font-mono  break-words text-left"
                          style={{
                            wordBreak: "break-all",
                          }}
                        >
                          {Array.isArray(param.value)
                            ? `[${param.value.join(", ")}]`
                            : param.value}
                        </span>
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    );
  };

  const RawView = () => (
    <div className="space-y-[20px]">
      {actionPanelInfo.map((action, index) => (
        <div key={index}>
          <h3 className="mb-[10px] text-[18px] font-semibold">
            Function {index + 1}
          </h3>

          <div className="space-y-[20px] rounded-[4px] border p-[20px]">
            {action.type === "custom" && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Signature:
                </h4>
                <p className="text-[14px] font-mono font-semibold">
                  {action.signature}
                </p>
              </div>
            )}

            {action.calldata && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Calldata:
                </h4>
                {action.calldata.map(({ name, value }, cIndex) => (
                  <div
                    key={cIndex}
                    className="text-[14px] font-mono font-semibold"
                  >
                    {name}:{" "}
                    {Array.isArray(value) ? `[${value.join(", ")}]` : value}
                  </div>
                ))}
              </div>
            )}

            {action.address && (
              <div>
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Target:
                </h4>
                <p className="text-[14px] font-mono font-semibold">
                  {action.address}
                </p>
              </div>
            )}

            <div>
              <h4 className="text-[14px] font-normal text-muted-foreground">
                Value:
              </h4>
              <p className="text-[14px] font-mono font-semibold">
                {action.value
                  ? parseUnits(
                      action.value,
                      daoConfig?.network?.nativeToken?.decimals ?? 18
                    )
                  : "0"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  useEffect(() => {
    return () => {
      setOpenParams([]);
    };
  }, []);

  return (
    <>
      {actionPanelInfo?.length > 0 && (
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
          <div className="space-y-[20px]">
            <div className="flex items-center justify-between">
              <h2 className="text-[26px] font-semibold">Actions</h2>
              {tab === "summary" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab("raw")}
                  className="rounded-full border-border bg-card"
                >
                  Raw
                </Button>
              )}
              {tab === "raw" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab("summary")}
                  className="rounded-full border-border bg-card"
                >
                  Summary
                </Button>
              )}
            </div>

            {tab === "raw" && <RawView />}
            {tab === "summary" && <SummaryView />}
          </div>
        </div>
      )}
    </>
  );
};
