import { gql } from 'graphql-request';

export const BIND_NOTIFICATION_CHANNEL = gql`
  mutation BindNotificationsChannel($type: NotificationChannelType!, $value: String!) {
    bindNotificationChannel(input: { type: $type, value: $value }) {
      id
      code
      expiration
      message
      rateLimit
    }
  }
`;

export const RESEND_OTP = gql`
  mutation ResendOTP($type: NotificationChannelType!, $value: String!) {
    resendOTP(input: { type: $type, value: $value }) {
      id
      expiration
      code
      message
      rateLimit
    }
  }
`;

export const VERIFY_NOTIFICATION_CHANNEL = gql`
  mutation VerifyNotificationChannel($id: String!, $otpCode: String!) {
    verifyNotificationChannel(input: { id: $id, otpCode: $otpCode }) {
      code
      message
    }
  }
`;

export const SUBSCRIBE_PROPOSAL = gql`
  mutation SubscribeProposal(
    $daoCode: String!
    $proposalId: String!
    $features: [SubscriptionFeatureInput!]
  ) {
    subscribeProposal(
      input: { daoCode: $daoCode, proposalId: $proposalId, features: $features }
    ) {
      state
      proposalId
      daoCode
    }
  }
`;

export const UNSUBSCRIBE_PROPOSAL = gql`
  mutation UnsubscribeProposal($daoCode: String!, $proposalId: String!) {
    unsubscribeProposal(input: { daoCode: $daoCode, proposalId: $proposalId }) {
      state
      proposalId
      daoCode
    }
  }
`;