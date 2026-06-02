import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import { QUERY_CONFIGS } from "@/utils/query-config";

interface GovernanceCountsOptions {
  enabled?: boolean;
}

export function useGovernanceCounts(
  options: GovernanceCountsOptions = {}
) {
  const { enabled = true } = options;
  const daoConfig = useDaoConfig();
  const endpoint = daoConfig?.indexer?.endpoint ?? "";

  return useQuery({
    queryKey: ["governanceCounts", endpoint],
    queryFn: () => proposalService.getGovernanceCounts(endpoint),
    enabled: enabled && !!endpoint,
    placeholderData: keepPreviousData,
    ...QUERY_CONFIGS.DEFAULT,
  });
}
