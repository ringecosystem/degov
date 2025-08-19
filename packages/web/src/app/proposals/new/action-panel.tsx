import { motion, AnimatePresence } from "framer-motion";
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
import { DEFAULT_ANIMATION_DURATION } from "@/config/base";
import { PROPOSAL_ACTIONS, PROPOSAL_ACTIONS_LIGHT } from "@/config/proposals";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import {
  extractMethodNameFromSignature,
  parseSolidityFunctionParams,
} from "@/utils";
import { formatShortAddress } from "@/utils/address";

import { generateFunctionSignature } from "./helper";

import type { Action } from "./type";
import type { Address } from "viem";

const buttonVariants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

const contentVariants = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
};
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
  const daoConfig = useDaoConfig();

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
          case "xaccount":
            return !!Object.keys(action?.content).length;
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
            info.details = `${action.content.amount} ${daoConfig?.chain?.nativeToken?.symbol}`;
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
            info.signature = generateFunctionSignature(
              action.content.contractMethod,
              action.content.calldata,
              { useTypes: true, includeNames: true }
            );

            info.calldata = action?.content?.calldata?.map((item) => {
              return {
                name: item.type,
                value: item.value,
              };
            });

            break;

          case "xaccount":
            info.address = action.content?.crossChainCall?.port;
            info.details = extractMethodNameFromSignature(
              action.content?.crossChainCall?.function ?? ""
            );
            info.params = Object.entries(
              action.content?.crossChainCall?.params ?? {}
            ).map(([key, value]) => ({
              name: key,
              value: value,
            }));
            info.signature = action.content?.crossChainCall?.function;
            info.calldata = parseSolidityFunctionParams(
              action.content?.crossChainCall?.function ?? "",
              action?.content?.crossChainCall?.params ?? {}
            );
            info.value = action.content?.crossChainCall?.value ?? "0";
            break;
        }
        return info;
      });
  }, [actions, daoConfig]);

  const SummaryView = useMemo(() => {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3 rounded-l-[14px] px-[10px] text-left">
              Type
            </TableHead>
            <TableHead className="w-1/3 px-[10px] text-left">To</TableHead>
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
                        PROPOSAL_ACTIONS_LIGHT[
                          action.type as keyof typeof PROPOSAL_ACTIONS_LIGHT
                        ]
                      }
                      alt={action.type || ""}
                      className="h-[24px] w-[24px] rounded-full block dark:hidden"
                      width={24}
                      height={24}
                    />
                    <Image
                      src={
                        PROPOSAL_ACTIONS[
                          action.type as keyof typeof PROPOSAL_ACTIONS
                        ]
                      }
                      alt={action.type || ""}
                      className="h-[24px] w-[24px] rounded-full hidden dark:block"
                      width={24}
                      height={24}
                    />
                    <span className="text-[14px] capitalize">
                      {action.type === "xaccount"
                        ? "XAccount Cross-chain"
                        : action.type}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="w-1/3 text-left">
                  {action.address ? (
                    <a
                      href={`${daoConfig?.chain?.explorers?.[0]}/address/${action.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-[5px] hover:underline font-mono"
                    >
                      {action.address
                        ? formatShortAddress(action.address)
                        : "No address"}
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
                  ) : (
                    <span className="text-muted-foreground"></span>
                  )}
                </TableCell>
                <TableCell className="w-1/3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{action.details}</span>
                    {action?.params?.length && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleParams(index)}
                        className="text-[14px] text-foreground/40 cursor-pointer"
                        asChild
                      >
                        <motion.div whileTap={{ scale: 0.95 }}>
                          {action?.params?.length} params
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform duration-200",
                              openParams.includes(index) && "rotate-180"
                            )}
                          />
                        </motion.div>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              <AnimatePresence>
                {action.params && openParams.includes(index) && (
                  <motion.tr
                    data-expanded
                    className="border-t-0"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: DEFAULT_ANIMATION_DURATION }}
                  >
                    <TableCell colSpan={3} className="pt-0">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        <div className="border border-gray-1 bg-background">
                          {action.params.map((param, pIndex) => (
                            <div
                              key={pIndex}
                              className={cn(
                                "grid grid-cols-[140px_1fr]",
                                pIndex > 0 && "border-t border-gray-1"
                              )}
                            >
                              <div className="p-[10px] text-[12px] font-medium border-r border-gray-1 flex items-center justify-center">
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
                          ))}
                        </div>
                      </motion.div>
                    </TableCell>
                  </motion.tr>
                )}
              </AnimatePresence>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    );
  }, [actionPanelInfo, openParams, daoConfig?.chain?.explorers]);

  const RawView = useMemo(() => {
    return (
      <div className="space-y-[20px]">
        {actionPanelInfo.map((action, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DEFAULT_ANIMATION_DURATION,
              delay: index * 0.05,
            }}
          >
            <h3 className="mb-[10px] text-[18px] font-semibold">
              Function {index + 1}
            </h3>

            <div className="space-y-[10px] rounded-[4px] border border-gray-1 p-[10px] bg-background">
              {(action.type === "custom" || action.type === "xaccount") && (
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
                <div className="w-full">
                  <h4 className="text-[14px] font-normal text-muted-foreground">
                    Calldata:
                  </h4>
                  {action.calldata.map(({ name, value }, cIndex) => (
                    <div
                      key={cIndex}
                      className="text-[14px] font-mono font-semibold"
                      style={{
                        wordBreak: "break-all",
                      }}
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

              <div className="w-full">
                <h4 className="text-[14px] font-normal text-muted-foreground">
                  Value:
                </h4>
                <p className="text-[14px] font-mono font-semibold">
                  {action.value
                    ? parseUnits(
                        action.value,
                        daoConfig?.chain?.nativeToken?.decimals ?? 18
                      )
                    : "0"}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }, [actionPanelInfo, daoConfig?.chain?.nativeToken?.decimals]);

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
              <motion.h2
                className="text-[26px] font-semibold"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DEFAULT_ANIMATION_DURATION }}
              >
                Actions
              </motion.h2>

              <AnimatePresence mode="wait" initial={false}>
                {tab === "summary" && (
                  <motion.div
                    key="raw-button"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={buttonVariants}
                    transition={{ duration: DEFAULT_ANIMATION_DURATION }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("raw")}
                      className="rounded-full border-border bg-card cursor-pointer"
                      asChild
                    >
                      <motion.div whileTap={{ scale: 0.95 }}>Raw</motion.div>
                    </Button>
                  </motion.div>
                )}
                {tab === "raw" && (
                  <motion.div
                    key="summary-button"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={buttonVariants}
                    transition={{ duration: DEFAULT_ANIMATION_DURATION }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("summary")}
                      className="rounded-full border-border bg-card cursor-pointer"
                      asChild
                    >
                      <motion.div whileTap={{ scale: 0.95 }}>
                        Summary
                      </motion.div>
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {tab === "raw" ? (
                <motion.div
                  key="raw-content"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={contentVariants}
                  transition={{
                    duration: DEFAULT_ANIMATION_DURATION,
                    ease: "easeInOut",
                  }}
                >
                  {RawView}
                </motion.div>
              ) : (
                <motion.div
                  key="summary-content"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={contentVariants}
                  transition={{
                    duration: DEFAULT_ANIMATION_DURATION,
                    ease: "easeInOut",
                  }}
                >
                  {SummaryView}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </>
  );
};
