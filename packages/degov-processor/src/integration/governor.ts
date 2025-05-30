import type { DgvProposalCreated } from "../types";

export type StoreOptions = Partial<{
  isInsert: boolean;
  isUpdate: boolean;
}>;

export interface GovernorIntegration {
  storeProposalCreated: (
    entity: Readonly<DgvProposalCreated>,
    options?: Readonly<StoreOptions>
  ) => Promise<void>;

  storeProposal()
}
