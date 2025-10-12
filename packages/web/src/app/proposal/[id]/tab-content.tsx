import type { ProposalItem } from "@/services/graphql/types";

import { ActionsTable } from "./actions-table";
import { Description } from "./proposal/description";

export const TabContent = ({
  data,
  isFetching,
}: {
  data?: ProposalItem;
  isFetching: boolean;
}) => {
  return (
    <div className="flex flex-col gap-[20px]">
      <Description data={data} isFetching={isFetching} />
      <ActionsTable data={data} isFetching={isFetching} />
    </div>
  );
};
