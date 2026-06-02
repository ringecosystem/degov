import {
  RESEND_OTP,
  VERIFY_NOTIFICATION_CHANNEL,
  SUBSCRIBE_PROPOSAL,
  UNSUBSCRIBE_PROPOSAL,
  SUBSCRIBE_DAO,
  UNSUBSCRIBE_DAO,
} from "./graphql/mutations/notifications";
import { requestNotification } from "./graphql/notification-client";
import {
  LIST_NOTIFICATION_CHANNELS,
  SUBSCRIBED_DAOS,
  SUBSCRIBED_PROPOSALS,
} from "./graphql/queries/notifications";

import type {
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
  OtpRequestResponse,
} from "./graphql/types/notifications";

export class NotificationService {
  static async listNotificationChannels(address: string): Promise<NotificationChannel[]> {
    const response =
      await requestNotification<ListNotificationChannelsResponse>(
        LIST_NOTIFICATION_CHANNELS,
        undefined,
        address
      );

    return response.listNotificationChannels;
  }

  static async getSubscribedDaos(address: string): Promise<SubscribedDao[]> {
    const response = await requestNotification<SubscribedDaosResponse>(
      SUBSCRIBED_DAOS,
      undefined,
      address
    );

    return response.subscribedDaos;
  }

  static async getSubscribedProposals(address: string): Promise<SubscribedProposal[]> {
    const response = await requestNotification<SubscribedProposalsResponse>(
      SUBSCRIBED_PROPOSALS,
      undefined,
      address
    );

    return response.subscribedProposals;
  }

  static async resendOTP(
    type: NotificationChannelType,
    value: string,
    address: string
  ): Promise<OtpRequestResponse> {
    const response = await requestNotification<{
      resendOTP: OtpRequestResponse;
    }>(RESEND_OTP, { type, value }, address);

    return response.resendOTP;
  }

  static async verifyNotificationChannel(
    input: VerifyNotificationChannelInput,
    address: string
  ): Promise<VerifyNotificationChannelResponse> {
    const response = await requestNotification<{
      verifyNotificationChannel: VerifyNotificationChannelResponse;
    }>(VERIFY_NOTIFICATION_CHANNEL, {
      type: input.type,
      value: input.value,
      otpCode: input.otpCode,
    }, address);

    return response.verifyNotificationChannel;
  }

  static async subscribeProposal(
    input: ProposalSubscriptionInput,
    address: string
  ): Promise<ProposalSubscriptionResponse> {
    const response = await requestNotification<{
      subscribeProposal: ProposalSubscriptionResponse;
    }>(SUBSCRIBE_PROPOSAL, {
      daoCode: input.daoCode,
      proposalId: input.proposalId,
      features: input.features,
    }, address);

    return response.subscribeProposal;
  }

  static async unsubscribeProposal(
    daoCode: string,
    proposalId: string,
    address: string
  ): Promise<ProposalSubscriptionResponse> {
    const response = await requestNotification<{
      unsubscribeProposal: ProposalSubscriptionResponse;
    }>(UNSUBSCRIBE_PROPOSAL, { daoCode, proposalId }, address);

    return response.unsubscribeProposal;
  }

  static async subscribeDao(
    input: DaoSubscriptionInput,
    address: string
  ): Promise<DaoSubscriptionResponse> {
    const response = await requestNotification<{
      subscribeDao: DaoSubscriptionResponse;
    }>(SUBSCRIBE_DAO, {
      daoCode: input.daoCode,
      features: input.features,
    }, address);

    return response.subscribeDao;
  }

  static async unsubscribeDao(
    daoCode: string,
    address: string
  ): Promise<DaoSubscriptionResponse> {
    const response = await requestNotification<{
      unsubscribeDao: DaoSubscriptionResponse;
    }>(UNSUBSCRIBE_DAO, { daoCode }, address);

    return response.unsubscribeDao;
  }
}
