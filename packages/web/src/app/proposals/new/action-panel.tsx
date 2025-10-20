"use client";

import { Interface } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { ActionTableSummary } from "@/app/proposal/[id]/action-table-summary";
import { transformActionsToProposalParams } from "@/app/proposals/new/helper";
import { useDaoConfig } from "@/hooks/useDaoConfig";

import type { Action as BuilderAction } from "./type";
import type { Action as SummaryAction } from "../../../hooks/useDecodeCallData";

interface ActionsPanelProps {
  actions: BuilderAction[];
}

const DEFAULT_TRANSFER_SIGNATURE =
  "transfer(address recipient, uint256 amount)";

export const ActionsPanel = ({ actions }: ActionsPanelProps) => {
  const daoConfig = useDaoConfig();
  const decimals = daoConfig?.chain?.nativeToken?.decimals ?? 18;

  const [encodedActions, setEncodedActions] = useState<SummaryAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const preparedActions = useMemo(() => {
    return actions.filter((action) => {
      switch (action.type) {
        case "transfer":
          return (
            !!action.content.recipient &&
            isAddress(action.content.recipient) &&
            action.content.amount !== undefined &&
            action.content.amount !== ""
          );
        case "custom":
          return (
            !!action.content.target &&
            isAddress(action.content.target) &&
            !!action.content.contractMethod &&
            !!action.content.calldata &&
            action.content.calldata.length > 0 &&
            action.content.calldata.every((item) => item.value !== undefined)
          );
        case "xaccount": {
          const call = action.content?.crossChainCall;
          return (
            !!call &&
            !!call.function &&
            !!call.params &&
            !!call.port &&
            isAddress(call.port) &&
            !!call.value
          );
        }
        default:
          return false;
      }
    });
  }, [actions]);

  useEffect(() => {
    let isMounted = true;

    const prepareActions = async () => {
      if (preparedActions.length === 0) {
        if (isMounted) {
          setEncodedActions([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const result = await transformActionsToProposalParams(
          preparedActions,
          decimals
        );

        const formattedActions: SummaryAction[] = [];

        result.actions.forEach((actionParam) => {
          try {
            const iface = new Interface(actionParam.abi);
            const fragment = iface.getFunction(
              actionParam.signature ?? actionParam.functionName
            );

            const calldata =
              actionParam.type === "transfer"
                ? ("0x" as const)
                : (iface.encodeFunctionData(
                    fragment!,
                    actionParam.params
                  ) as `0x${string}`);

            const signature =
              actionParam.type === "transfer"
                ? actionParam.signature ?? DEFAULT_TRANSFER_SIGNATURE
                : actionParam.signature ?? fragment?.format();

            formattedActions.push({
              target: String(actionParam.target),
              calldata,
              signature,
              value: actionParam.value.toString(),
            });
          } catch (error) {
            console.error("Failed to encode action for preview:", error);
          }
        });

        if (!isMounted) return;

        setEncodedActions(formattedActions);
      } catch (error) {
        console.error("Failed to prepare actions for preview:", error);
        if (isMounted) {
          setEncodedActions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void prepareActions();

    return () => {
      isMounted = false;
    };
  }, [preparedActions, decimals]);

  if (preparedActions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card">
      <header className="flex items-center justify-between border-b border-card-background pb-[10px]">
        <h4 className="text-[18px] font-semibold">Actions</h4>
      </header>
      <ActionTableSummary actions={encodedActions} isLoading={isLoading} />
    </div>
  );
};
