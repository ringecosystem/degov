export type ProposalCommentState = "ACTIVE" | "DELETED";

export interface ProposalComment {
  id: string;
  daoCode: string;
  chainId: number;
  proposalId: string;
  authorAddress: `0x${string}`;
  replyToId?: string | null;
  body?: string | null;
  state: ProposalCommentState;
  ctime: string;
  utime?: string | null;
}

export interface ProposalCommentPage {
  items: ProposalComment[];
  pageInfo: {
    endCursor?: string | null;
    hasNextPage: boolean;
  };
}

export interface ProposalCommentsInput {
  daoCode: string;
  proposalId: string;
  first?: number;
  after?: string;
}

export interface CreateProposalCommentInput {
  daoCode: string;
  proposalId: string;
  body: string;
  replyToId?: string;
}

export interface UpdateProposalCommentInput {
  daoCode: string;
  commentId: string;
  body: string;
}

export interface DeleteProposalCommentInput {
  daoCode: string;
  commentId: string;
}
