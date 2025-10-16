import { motion } from "framer-motion";
import { useMemo } from "react";

import { DEFAULT_ANIMATION_DURATION } from "@/config/base";
import type { ProposalItem } from "@/services/graphql/types";

import { ActionTableSummary } from "./action-table-summary";

interface ActionsTableProps {
  data?: ProposalItem;
  isFetching: boolean;
}

export function ActionsTable({ data, isFetching }: ActionsTableProps) {
  const actions = useMemo(() => {
    // If the proposal is a self-proposal and value is 0, return an empty array
    if (
      data?.targets?.length === 1 &&
      data?.calldatas?.length === 1 &&
      data?.calldatas?.[0] === "0x" &&
      data?.proposer?.toLowerCase() === data?.targets?.[0]?.toLowerCase() &&
      data?.values?.[0] === "0"
    ) {
      return [];
    }
    if (data) {
      return data?.calldatas?.map((calldata, index) => {
        return {
          target: data?.targets[index],
          calldata: calldata,
          value: data?.values[index],
          signature: data?.signatureContent?.[index] ?? calldata,
        };
      });
    }
    return [];
  }, [data]);

  return Array.isArray(actions) && actions?.length > 0 ? (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card">
      <header className="flex items-center justify-between border-b border-card-background pb-[10px]">
        <motion.h4
          className="text-[18px] font-semibold"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: DEFAULT_ANIMATION_DURATION }}
        >
          Actions
        </motion.h4>
      </header>

      <ActionTableSummary actions={actions} isLoading={isFetching} />
    </div>
  ) : null;
}
