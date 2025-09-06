import {
  BIND_NOTIFICATION_CHANNEL,
  RESEND_OTP,
  VERIFY_NOTIFICATION_CHANNEL,
  SUBSCRIBE_PROPOSAL,
  UNSUBSCRIBE_PROPOSAL,
} from "./graphql/mutations/notifications";
import { requestNotification } from "./graphql/notification-client";
import type {
  BindNotificationChannelInput,
  BindNotificationChannelResponse,
  VerifyNotificationChannelInput,
  VerifyNotificationChannelResponse,
  ProposalSubscriptionInput,
  ProposalSubscriptionResponse,
  NotificationChannelType,
} from "./graphql/types/notifications";

export class NotificationService {
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
}