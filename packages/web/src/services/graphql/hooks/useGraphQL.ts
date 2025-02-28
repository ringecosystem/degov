import { useCallback } from "react";

import { useConfig } from "@/hooks/useConfig";
import { proposalService } from "@/services/graphql";

export function useProposalService() {
  const config = useConfig();

  return {
    getProposalCreatedById: useCallback(
      (id: string) => proposalService.getProposalCreatedById(config, id),
      [config]
    ),
  };
}
