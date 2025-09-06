export type NotificationChannelType = 'EMAIL';

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
  type: string;
  enabled: boolean;
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