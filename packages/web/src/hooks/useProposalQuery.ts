import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

import { useConfig } from "@/hooks/useConfig";
import { proposalService } from "@/services/graphql";

export function useAllProposals(params: { limit: number; offset?: number }) {
  const config = useConfig();

  return useQuery({
    queryKey: ["proposals", "all", params],
    queryFn: async () => {
      const result = await proposalService.getAllProposals(config, params);
      return result;
    },
    refetchInterval: 30000,
  });
}

export function useInfiniteProposals(pageSize: number = 10) {
  const config = useConfig();

  return useInfiniteQuery({
    queryKey: ["proposals", "infinite", pageSize],
    queryFn: async ({ pageParam }) => {
      console.log("pageParam", pageParam);

      const result = await proposalService.getAllProposals(config, {
        limit: pageSize,
        offset: pageParam ? pageParam?.toString() : undefined,
      });
      return result;
    },
    initialPageParam: null, // 添加这个必需的属性
    getNextPageParam: (lastPage) => {
      // 如果返回的数据少于请求的数量，说明没有更多数据了
      if (lastPage.proposals.length < pageSize) return undefined;
      return lastPage.pageInfo?.endCursor;
    },
  });
}
