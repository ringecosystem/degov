export type NotificationChannelType = "EMAIL";

export enum FeatureName {
  PROPOSAL_NEW = "PROPOSAL_NEW",
  PROPOSAL_STATE_CHANGED = "PROPOSAL_STATE_CHANGED",
  VOTE_END = "VOTE_END",
  VOTE_EMITTED = "VOTE_EMITTED",
}

export interface NotificationChannel {
  id: string;
  channelType: NotificationChannelType;
  channelValue: string;
  verified: boolean;
  payload?: string;
  ctime: string;
}

export interface ListNotificationChannelsResponse {
  listNotificationChannels: NotificationChannel[];
}

export interface BindNotificationChannelInput {
  type: NotificationChannelType;
  value: string;
}

export interface BindNotificationChannelResponse {
  id: string;
  code: number;
  expiration: number;
  message?: string;
  rateLimit: number;
}

export interface VerifyNotificationChannelInput {
  id: string;
  otpCode: string;
}

export interface VerifyNotificationChannelResponse {
  code: number;
  message?: string;
}

export interface SubscriptionFeatureInput {
  name: FeatureName;
  strategy: string;
}

export interface ProposalSubscriptionInput {
  daoCode: string;
  proposalId: string;
  features?: SubscriptionFeatureInput[];
}

export interface ProposalSubscriptionResponse {
  state: string;
  proposalId: string;
  daoCode: string;
}

// Types for subscribedDaos query
export interface SubscribedFeature {
  name: string;
  strategy: string;
}

export interface Dao {
  code: string;
  name: string;
  // Add other DAO fields as needed
}

export interface SubscribedDao {
  dao: Dao;
  features: SubscribedFeature[];
}

export interface SubscribedDaosResponse {
  subscribedDaos: SubscribedDao[];
}

export interface DaoSubscriptionInput {
  daoCode?: string;
  features?: SubscriptionFeatureInput[];
}

export interface DaoSubscriptionResponse {
  daoCode: string;
  state: string;
}

// Types for subscribedProposals query
export interface Proposal {
  id: string;
  proposalId: string;
  daoCode: string;
  title: string;
  state: string;
}

export interface SubscribedProposal {
  dao: Dao;
  proposal: Proposal;
  features: SubscribedFeature[];
}

export interface SubscribedProposalsResponse {
  subscribedProposals: SubscribedProposal[];
}
