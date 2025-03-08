import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ProposalItem } from "@/services/graphql/types";

import { ActionTableRaw } from "./action-table-raw";
import { ActionTableSummary } from "./action-table-summary";

interface ActionsTableProps {
  data?: ProposalItem;
  isFetching: boolean;
}

export function ActionsTable({ data }: ActionsTableProps) {
  const [tab, setTab] = useState<"summary" | "raw">("summary");

  const actions = useMemo(() => {
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
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <header className="flex items-center justify-between">
        <h4 className="text-[26px] font-semibold">Actions</h4>

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
      </header>

      {tab === "summary" && <ActionTableSummary actions={actions} />}
      {tab === "raw" && <ActionTableRaw actions={actions} />}
    </div>
  ) : null;
}
