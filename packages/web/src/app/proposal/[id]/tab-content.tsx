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
      {data?.discussion ? (
        <div className="flex flex-col gap-[20px] p-[20px] rounded-[14px] bg-card">
          <div className="flex flex-col gap-[12px]">
            <h3 className="text-[26px] font-semibold text-foreground">
              Discussions
            </h3>
            <a
              href={data?.discussion}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[18px] font-semibold hover:underline"
            >
              {data?.discussion}
            </a>
          </div>
        </div>
      ) : null}
      <Description data={data} isFetching={isFetching} />
      <ActionsTable data={data} isFetching={isFetching} />
    </div>
  );
};
