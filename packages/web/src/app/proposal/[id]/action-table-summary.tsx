import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import React from "react";
import { useMemo, useState, useEffect } from "react";

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
import { formatFunctionSignature } from "@/utils";
import { decodeRecursive, type DecodeRecursiveResult } from "@/utils/decoder";
import { formatBigIntForDisplay } from "@/utils/number";

import type { Action } from "./action-table-raw";

interface ActionTableSummaryProps {
  actions: Action[];
  isLoading?: boolean;
}

interface DecodedAction extends Action {
  decodedResult?: DecodeRecursiveResult | null;
  isDecoding?: boolean;
}

interface ParsedParam {
  name: string;
  type: string;
  value: string | string[];
}

function parseCalldataParams(
  signature: string,
  calldata: string
): ParsedParam[] {
  if (!signature || !calldata || calldata === "0x") return [];

  try {
    const iface = new ethers.Interface([`function ${signature}`]);
    const decoded = iface.parseTransaction({ data: calldata });

    if (!decoded) return [];

    return decoded.args.map((arg, index) => {
      const input = decoded.fragment.inputs[index];
      return {
        name: input?.name || `param${index}`,
        type: input?.type || "unknown",
        value: Array.isArray(arg) ? arg.map(String) : String(arg),
      };
    });
  } catch {
    return [];
  }
}

export function ActionTableSummary({
  actions,
  isLoading = false,
}: ActionTableSummaryProps) {
  const daoConfig = useDaoConfig();
  const [openParams, setOpenParams] = useState<number[]>([]);
  const [decodedActions, setDecodedActions] = useState<DecodedAction[]>([]);
  // Component-level decoding cache to avoid duplicate decoding
  const decodingCache = useMemo(
    () => new Map<string, Promise<DecodeRecursiveResult | null>>(),
    []
  );

  // Decode actions using calldata decoder
  useEffect(() => {
    const decodeActions = async () => {
      const decoded = await Promise.all(
        actions.map(async (action) => {
          // Skip decoding for simple transfers or empty calldata
          if (!action.calldata || action.calldata === "0x") {
            return { ...action, decodedResult: null, isDecoding: false };
          }

          // Create cache key including all parameters that affect decoding
          const cacheKey = `${action.calldata}-${action.target}-${daoConfig?.chain?.id}-${action.signature}`;
          // Check if decoding is already in progress
          let decodePromise = decodingCache.get(cacheKey);
          if (!decodePromise) {
            // Create new decoding promise and cache it
            decodePromise = (async () => {
              try {
                // First, try simple signature-based parsing (faster)
                if (action.signature) {
                  const simpleParams = parseCalldataParams(
                    action.signature,
                    action.calldata
                  );
                  if (simpleParams.length > 0) {
                    // If simple parsing succeeded, return a compatible result
                    return {
                      functionName: action.signature.split('(')[0],
                      args: simpleParams.map(param => ({
                        name: param.name,
                        type: param.type,
                        value: param.value
                      })),
                      rawArgs: simpleParams.map(param => param.value)
                    };
                  }
                }

                let result = null;

                // If simple parsing failed, try advanced decoding with contract address
                if (daoConfig?.chain?.id && action.target) {
                  result = await decodeRecursive({
                    calldata: action.calldata,
                    address: action.target,
                    chainId: daoConfig.chain.id,
                  });
                }

                // Fallback to signature-based ABI decoding if address decoding fails
                if (!result && action.signature) {
                  try {
                    const iface = new ethers.Interface([
                      `function ${action.signature}`,
                    ]);
                    const abi = iface.fragments
                      .map((f) => f.format("json"))
                      .map((f) => JSON.parse(f));
                    result = await decodeRecursive({
                      calldata: action.calldata,
                      abi,
                    });
                  } catch {
                    // Signature decoding failed, continue with null result
                  }
                }

                return result;
              } catch {
                return null;
              }
            })();

            decodingCache.set(cacheKey, decodePromise);
          }

          const result = await decodePromise;
          return { ...action, decodedResult: result, isDecoding: false };
        })
      );
      setDecodedActions(decoded);
    };

    if (actions.length > 0) {
      // Set initial loading state
      setDecodedActions(
        actions.map((action) => ({ ...action, isDecoding: true }))
      );
      decodeActions();
    }
  }, [actions, daoConfig?.chain?.id, daoConfig?.indexer?.endpoint, decodingCache]);

  const toggleParams = (index: number) => {
    setOpenParams((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const data = useMemo(() => {
    return decodedActions.map((action, index) => {
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
        // Use decoded function name if available, otherwise use formatted signature
        if (action.decodedResult?.functionName) {
          details = action.decodedResult.functionName;
        } else {
          details = action?.signature
            ? formatFunctionSignature(action?.signature)
            : "";
        }
      }

      // Generate parameters for display
      let params: ParsedParam[] = [];
      if (action.decodedResult?.args) {
        // Use decoded parameters from decoder
        params = action.decodedResult.args.map((param) => ({
          name: param.name,
          type: param.type,
          value: Array.isArray(param.value) ? param.value : String(param.value),
        }));
      } else {
        // Fallback to signature-based parsing
        params = parseCalldataParams(
          action?.signature || "",
          action?.calldata || ""
        );
      }
      const hasParams = params.length > 0 && type !== "transfer";

      return {
        ...action,
        type,
        details,
        params,
        hasParams,
        index,
        isDecoding: action.isDecoding,
      };
    });
  }, [decodedActions, daoConfig]);

  const LoadingRows = useMemo(() => {
    return Array.from({ length: 3 }).map((_, index) => (
      <TableRow key={`loading-${index}`}>
        <TableCell className="text-left" style={{ width: "24.76%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
        <TableCell className="text-left" style={{ width: "41.8%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
        <TableCell className="text-left" style={{ width: "33.44%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
      </TableRow>
    ));
  }, []);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px]">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead
                className="text-left rounded-l-[14px]"
                style={{ width: "24.76%" }}
              >
                Type
              </TableHead>
              <TableHead
                className="text-left"
                style={{ width: "41.8%", minWidth: "410px" }}
              >
                To
              </TableHead>
              <TableHead
                className="text-left rounded-r-[14px]"
                style={{ width: "33.44%" }}
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
                      <TableRow
                        className={cn(
                          openParams.includes(record.index) &&
                            record.hasParams &&
                            "border-b-0"
                        )}
                      >
                        <TableCell
                          className="text-left"
                          style={{ width: "24.76%" }}
                        >
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

                        <TableCell
                          className="text-left"
                          style={{ width: "41.8%", minWidth: "410px" }}
                        >
                          {record.target ? (
                            <span className="flex items-center gap-[5px] font-mono">
                              {record.target}
                              <a
                                href={`${daoConfig?.chain?.explorers?.[0]}/address/${record.target}`}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:opacity-80 transition-opacity duration-300 cursor-pointer flex-shrink-0"
                              >
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
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              No address
                            </span>
                          )}
                        </TableCell>

                        <TableCell
                          className="text-left"
                          style={{ width: "33.44%", wordWrap: "break-word" }}
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
                              <TableCell colSpan={3} className="pt-0 px-[20px]">
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
                                            pIndex > 0 &&
                                              "border-t border-gray-1"
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
    </div>
  );
}
