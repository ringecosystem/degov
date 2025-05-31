import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import React from "react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEFAULT_ANIMATION_DURATION } from "@/config/base";
import { PROPOSAL_ACTIONS, PROPOSAL_ACTIONS_LIGHT } from "@/config/proposals";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import { formatFunctionSignature, simplifyFunctionSignature } from "@/utils";
import { formatShortAddress } from "@/utils/address";
import { formatBigIntForDisplay } from "@/utils/number";

import type { Action } from "./action-table-raw";

interface ActionTableSummaryProps {
  actions: Action[];
  isLoading?: boolean;
}

interface ParsedParam {
  name: string;
  type: string;
  value: string | string[];
}

// 解析 calldata 并获取实际参数值
function parseCalldataParams(
  signature: string,
  calldata: string
): ParsedParam[] {
  if (!signature || !calldata || calldata === "0x") return [];

  try {
    const simplifiedSignature = simplifyFunctionSignature(signature);
    const iface = new ethers.Interface([`function ${simplifiedSignature}`]);
    const decoded = iface.decodeFunctionData(
      simplifiedSignature.split("(")[0],
      calldata
    );

    // 提取参数类型和名称
    const match = signature.match(/\((.*)\)/);
    if (!match || !match[1].trim()) return [];

    const paramsString = match[1];
    const paramDefinitions = paramsString
      .split(",")
      .map((param) => param.trim());

    return paramDefinitions.map((paramDef, index) => {
      // 解析参数定义，提取类型和名称
      const parts = paramDef.trim().split(/\s+/);
      const type = parts[0];
      // 如果只有类型没有参数名，使用类型作为显示名称
      // 如果有参数名，使用参数名
      const name = parts.length >= 2 ? parts.slice(1).join(" ") : type;

      // 获取解码后的值
      let value = decoded[index];
      if (typeof value === "bigint") {
        value = value.toString();
      } else if (Array.isArray(value)) {
        value = Array.from(value).map((v) =>
          typeof v === "bigint" ? v.toString() : v
        );
      }

      return {
        name,
        type,
        value: Array.isArray(value) ? value : String(value),
      };
    });
  } catch (e) {
    console.warn("Error parsing calldata:", e);
    return [];
  }
}

export function ActionTableSummary({
  actions,
  isLoading = false,
}: ActionTableSummaryProps) {
  const daoConfig = useDaoConfig();
  const [openParams, setOpenParams] = useState<number[]>([]);

  const toggleParams = (index: number) => {
    setOpenParams((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const data = useMemo(() => {
    return actions.map((action, index) => {
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

      // 解析参数
      const params = parseCalldataParams(
        action?.signature || "",
        action?.calldata || ""
      );
      const hasParams = params.length > 0 && type !== "transfer";

      return {
        ...action,
        type,
        details,
        params,
        hasParams,
        index,
      };
    });
  }, [actions, daoConfig]);

  const LoadingRows = useMemo(() => {
    return Array.from({ length: 3 }).map((_, index) => (
      <TableRow key={`loading-${index}`}>
        <TableCell className="text-left" style={{ width: "33%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
        <TableCell className="text-left" style={{ width: "33%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
        <TableCell className="text-left" style={{ width: "33%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
      </TableRow>
    ));
  }, []);

  return (
    <div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead
              className="text-left rounded-l-[14px]"
              style={{ width: "33%" }}
            >
              Type
            </TableHead>
            <TableHead className="text-left" style={{ width: "33%" }}>
              Address Data
            </TableHead>
            <TableHead
              className="text-left rounded-r-[14px]"
              style={{ width: "33%" }}
            >
              Details
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>

      <div
        className="overflow-y-auto custom-scrollbar"
        style={{ maxHeight: "calc(100vh-200px)" }}
      >
        <Table className="table-fixed">
          <TableBody className="[&_tr:has(+tr[data-expanded])]:border-0">
            {isLoading
              ? LoadingRows
              : data.length > 0
              ? data.map((record) => (
                  <React.Fragment key={`${record.target}-${record.calldata}`}>
                    {/* 主要数据行 */}
                    <TableRow
                      className={cn(
                        openParams.includes(record.index) &&
                          record.hasParams &&
                          "border-b-0"
                      )}
                    >
                      {/* Type 列 */}
                      <TableCell className="text-left" style={{ width: "33%" }}>
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
                      </TableCell>

                      {/* Address Data 列 */}
                      <TableCell className="text-left" style={{ width: "33%" }}>
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
                      </TableCell>

                      {/* Details 列 */}
                      <TableCell
                        className="text-left"
                        style={{ width: "33%", wordWrap: "break-word" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="font-mono truncate"
                            title={record.details}
                          >
                            {record.details}
                          </span>
                          {record.hasParams && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleParams(record.index)}
                              className="text-[14px] text-foreground/40 cursor-pointer flex-shrink-0"
                              asChild
                            >
                              <motion.div whileTap={{ scale: 0.95 }}>
                                {record.params.length} params
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 transition-transform duration-200 ml-1",
                                    openParams.includes(record.index) &&
                                      "rotate-180"
                                  )}
                                />
                              </motion.div>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* 展开的参数行 */}
                    <AnimatePresence>
                      {record.hasParams &&
                        openParams.includes(record.index) && (
                          <motion.tr
                            data-expanded
                            className="border-t-0"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{
                              duration: DEFAULT_ANIMATION_DURATION,
                            }}
                          >
                            <TableCell colSpan={3} className="pt-0">
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.1 }}
                              >
                                <div className="border border-gray-1 bg-background">
                                  {record.params.map(
                                    (param: ParsedParam, pIndex: number) => (
                                      <div
                                        key={pIndex}
                                        className={cn(
                                          "grid grid-cols-[140px_1fr]",
                                          pIndex > 0 && "border-t border-gray-1"
                                        )}
                                      >
                                        <div className="p-[10px] text-[12px] font-medium border-r border-gray-1 flex items-center">
                                          {param.name}
                                        </div>
                                        <div
                                          className="p-[10px] text-[12px] font-mono break-words text-left"
                                          style={{
                                            wordBreak: "break-all",
                                          }}
                                        >
                                          {Array.isArray(param.value)
                                            ? `[${param.value.join(", ")}]`
                                            : param.value}
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              </motion.div>
                            </TableCell>
                          </motion.tr>
                        )}
                    </AnimatePresence>
                  </React.Fragment>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      {!isLoading && data.length === 0 && (
        <Empty
          label="No Actions"
          style={{
            height: 120,
          }}
        />
      )}
    </div>
  );
}
