import {
  BIND_NOTIFICATION_CHANNEL,
  RESEND_OTP,
  VERIFY_NOTIFICATION_CHANNEL,
  SUBSCRIBE_PROPOSAL,
  UNSUBSCRIBE_PROPOSAL,
  SUBSCRIBE_DAO,
  UNSUBSCRIBE_DAO,
} from "./graphql/mutations/notifications";
import { requestNotification } from "./graphql/notification-client";
import { LIST_NOTIFICATION_CHANNELS, SUBSCRIBED_DAOS, SUBSCRIBED_PROPOSALS } from "./graphql/queries/notifications";

import type {
  BindNotificationChannelInput,
  BindNotificationChannelResponse,
  VerifyNotificationChannelInput,
  VerifyNotificationChannelResponse,
  ProposalSubscriptionInput,
  ProposalSubscriptionResponse,
  NotificationChannelType,
  NotificationChannel,
  ListNotificationChannelsResponse,
  SubscribedDao,
  SubscribedDaosResponse,
  DaoSubscriptionInput,
  DaoSubscriptionResponse,
  SubscribedProposal,
  SubscribedProposalsResponse,
} from "./graphql/types/notifications";

export class NotificationService {
  static async listNotificationChannels(): Promise<NotificationChannel[]> {
    const response = await requestNotification<ListNotificationChannelsResponse>(
      LIST_NOTIFICATION_CHANNELS
    );
    
    return response.listNotificationChannels;
  }

  static async getSubscribedDaos(): Promise<SubscribedDao[]> {
    const response = await requestNotification<SubscribedDaosResponse>(
      SUBSCRIBED_DAOS
    );
    
    return response.subscribedDaos;
  }

  static async getSubscribedProposals(): Promise<SubscribedProposal[]> {
    const response = await requestNotification<SubscribedProposalsResponse>(
      SUBSCRIBED_PROPOSALS
    );
    
    return response.subscribedProposals;
  }
  static async bindNotificationChannel(
    input: BindNotificationChannelInput
  ): Promise<BindNotificationChannelResponse> {
    const response = await requestNotification<{
      bindNotificationChannel: BindNotificationChannelResponse;
    }>(
      BIND_NOTIFICATION_CHANNEL,
      { type: input.type, value: input.value }
    );
    
    return response.bindNotificationChannel;
  }

  static async resendOTP(
    type: NotificationChannelType,
    value: string
  ): Promise<BindNotificationChannelResponse> {
    const response = await requestNotification<{
      resendOTP: BindNotificationChannelResponse;
    }>(
      RESEND_OTP,
      { type, value }
    );
    
    return response.resendOTP;
  }

  static async verifyNotificationChannel(
    input: VerifyNotificationChannelInput
  ): Promise<VerifyNotificationChannelResponse> {
    const response = await requestNotification<{
      verifyNotificationChannel: VerifyNotificationChannelResponse;
    }>(
      VERIFY_NOTIFICATION_CHANNEL,
      { id: input.id, otpCode: input.otpCode }
    );
    
    return response.verifyNotificationChannel;
  }

  static async subscribeProposal(
    input: ProposalSubscriptionInput
  ): Promise<ProposalSubscriptionResponse> {
    const response = await requestNotification<{
      subscribeProposal: ProposalSubscriptionResponse;
    }>(
      SUBSCRIBE_PROPOSAL,
      {
        daoCode: input.daoCode,
        proposalId: input.proposalId,
        features: input.features,
      }
    );
    
    return response.subscribeProposal;
  }

  static async unsubscribeProposal(
    daoCode: string,
    proposalId: string
  ): Promise<ProposalSubscriptionResponse> {
    const response = await requestNotification<{
      unsubscribeProposal: ProposalSubscriptionResponse;
    }>(
      UNSUBSCRIBE_PROPOSAL,
      { daoCode, proposalId }
    );
    
    return response.unsubscribeProposal;
  }

  static async subscribeDao(
    input: DaoSubscriptionInput
  ): Promise<DaoSubscriptionResponse> {
    const response = await requestNotification<{
      subscribeDao: DaoSubscriptionResponse;
    }>(
      SUBSCRIBE_DAO,
      {
        daoCode: input.daoCode,
        features: input.features,
      }
    );
    
    return response.subscribeDao;
  }

  static async unsubscribeDao(
    daoCode: string
  ): Promise<DaoSubscriptionResponse> {
    const response = await requestNotification<{
      unsubscribeDao: DaoSubscriptionResponse;
    }>(
      UNSUBSCRIBE_DAO,
      { daoCode }
    );
    
    return response.unsubscribeDao;
  }
}