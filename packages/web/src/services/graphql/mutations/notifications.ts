import { gql } from "graphql-request";

export const RESEND_OTP = gql`
  mutation ResendOTP($type: NotificationChannelType!, $value: String!) {
    resendOTP(input: { type: $type, value: $value }) {
      expiration
      code
      message
      rateLimit
    }
  }
`;

export const VERIFY_NOTIFICATION_CHANNEL = gql`
  mutation VerifyNotificationChannel(
    $type: NotificationChannelType!
    $value: String!
    $otpCode: String!
  ) {
    verifyNotificationChannel(
      input: { type: $type, value: $value, otpCode: $otpCode }
    ) {
      code
      message
    }
  }
`;

export const SUBSCRIBE_PROPOSAL = gql`
  mutation SubscribeProposal(
    $daoCode: String!
    $proposalId: String!
    $features: [FeatureSettingsInput!]
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

export const SUBSCRIBE_DAO = gql`
  mutation SubscribeDao($daoCode: String!, $features: [FeatureSettingsInput!]) {
    subscribeDao(input: { daoCode: $daoCode, features: $features }) {
      daoCode
      state
    }
  }
`;

export const UNSUBSCRIBE_DAO = gql`
  mutation UnsubscribeDao($daoCode: String!) {
    unsubscribeDao(input: { daoCode: $daoCode }) {
      daoCode
      state
    }
  }
`;
