export interface ProposalDraft {
  id: string;
  daoCode: string;
  chainId: number;
  title: string;
  payload?: string | null;
  payloadVersion: number;
  revision: number;
  ctime: string;
  utime: string;
}

export interface ProposalDraftPage {
  items: ProposalDraft[];
  pageInfo: {
    endCursor?: string | null;
    hasNextPage: boolean;
  };
}

export interface ProposalDraftsInput {
  daoCode: string;
  first?: number;
  after?: string;
}

export interface ProposalDraftInput {
  daoCode: string;
  draftId: string;
}

export interface SaveProposalDraftInput {
  daoCode: string;
  draftId?: string;
  clientRequestId: string;
  title: string;
  payload: string;
  payloadVersion: number;
  revision?: number;
}

export interface DeleteProposalDraftInput {
  daoCode: string;
  draftId: string;
}
