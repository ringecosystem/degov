import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import React from "react";
import { useMemo, useState } from "react";

import { ExternalLinkIcon } from "@/components/icons";
import { getProposalActionIcon } from "@/components/icons/proposal-actions-map";
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
import { useDaoConfig } from "@/hooks/useDaoConfig";
import {
  type ParsedParam,
  useDecodeCallData,
  type Action,
} from "@/hooks/useDecodeCallData";
import { cn } from "@/lib/utils";
import { formatShortAddress } from "@/utils/address";
import { formatBigIntForDisplay } from "@/utils/number";

interface ActionTableSummaryProps {
  actions: Action[];
  isLoading?: boolean;
}

export function ActionTableSummary({
  actions,
  isLoading = false,
}: ActionTableSummaryProps) {
  const daoConfig = useDaoConfig();
  const [openParams, setOpenParams] = useState<number[]>([]);
  const [jsonViewIndexes, setJsonViewIndexes] = useState<number[]>([]);
  const decodedActions = useDecodeCallData(actions);

  const toggleParams = (index: number) => {
    setOpenParams((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
    // Reset JSON view when toggling params
    setJsonViewIndexes((prev) => prev.filter((i) => i !== index));
  };

  const toggleJsonView = (index: number) => {
    setJsonViewIndexes((prev) =>
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
        // Use full function signature for better readability
        details = action.fullFunctionSignature || action.signature || action.functionName || "";
      }

      // Use parameters from hook
      const params = action.parsedCalldata || [];
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
        <TableCell className="text-left" style={{ width: "24.77%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
        <TableCell className="text-left" style={{ width: "25.48%" }}>
          <Skeleton className="w-full h-[30px]" />
        </TableCell>
        <TableCell className="text-left" style={{ width: "49.75%" }}>
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
                style={{ width: "24.77%" }}
              >
                Type
              </TableHead>
              <TableHead
                className="text-left"
                style={{ width: "25.48%" }}
              >
                To
              </TableHead>
              <TableHead
                className="text-left rounded-r-[14px]"
                style={{ width: "49.75%" }}
              >
                Action
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
                          style={{ width: "24.77%" }}
                        >
                          <div className="flex items-center gap-[10px]">
                            {(() => {
                              const IconComponent = getProposalActionIcon(
                                record.type?.toLowerCase()
                              );
                              return (
                                <IconComponent
                                  width={24}
                                  height={24}
                                  className="rounded-full text-current"
                                />
                              );
                            })()}
                            <span className="text-[14px] capitalize">
                              {record.type === "xAccount"
                                ? "XAccount Cross-chain"
                                : record.type}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell
                          className="text-left"
                          style={{ width: "25.48%" }}
                        >
                          {record.target ? (
                            <span className="flex items-center gap-[5px] font-mono">
                              {formatShortAddress(record.target)}
                              <a
                                href={`${daoConfig?.chain?.explorers?.[0]}/address/${record.target}`}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:opacity-80 transition-opacity duration-300 cursor-pointer shrink-0"
                              >
                                <ExternalLinkIcon
                                  width={16}
                                  height={16}
                                  className="text-muted-foreground"
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
                          style={{ width: "49.75%", wordWrap: "break-word" }}
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
                                className="text-[14px] text-foreground/40 font-normal cursor-pointer shrink-0"
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
                                <div className="space-y-[10px]">
                                  <AnimatePresence mode="wait">
                                    {!jsonViewIndexes.includes(record.index) ? (
                                      <motion.div
                                        key="params-view"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{
                                          duration: DEFAULT_ANIMATION_DURATION,
                                        }}
                                        className="space-y-[10px]"
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
                                        <div className="flex justify-end">
                                          <button
                                            onClick={() => toggleJsonView(record.index)}
                                            className="h-7 px-2.5 py-1 rounded-[100px] outline-1 outline-offset-[-0.50px] outline-foreground inline-flex justify-center items-center gap-[5px] hover:bg-accent cursor-pointer transition-colors"
                                          >
                                            <span className="text-foreground text-sm font-normal">View Json</span>
                                          </button>
                                        </div>
                                      </motion.div>
                                    ) : (
                                      <motion.div
                                        key="json-view"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{
                                          duration: DEFAULT_ANIMATION_DURATION,
                                        }}
                                        className="space-y-[10px]"
                                      >
                                        <div className="p-2.5 bg-background outline-1 outline-offset-[-0.50px] outline-gray-1">
                                          <pre className="text-left text-foreground text-sm font-normal overflow-x-auto whitespace-pre-wrap break-words">
                                            {JSON.stringify(
                                              {
                                                signature: record.fullFunctionSignature || record.signature || record.functionName,
                                                calldata: record.params.reduce((acc: Record<string, string | string[]>, param: ParsedParam) => {
                                                  acc[param.name] = param.value;
                                                  return acc;
                                                }, {} as Record<string, string | string[]>),
                                                target: record.target,
                                                value: record.value || "0",
                                              },
                                              null,
                                              2
                                            )}
                                          </pre>
                                        </div>
                                        <div className="flex justify-end">
                                          <button
                                            onClick={() => toggleJsonView(record.index)}
                                            className="h-7 px-2.5 py-1 rounded-[100px] outline-1 outline-offset-[-0.50px] outline-foreground inline-flex justify-center items-center gap-[5px] hover:bg-accent cursor-pointer transition-colors"
                                          >
                                            <span className="text-foreground text-sm font-normal">Back</span>
                                          </button>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
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
