import { gql } from 'graphql-request';

export const LIST_NOTIFICATION_CHANNELS = gql`
  query ListNotificationChannels {
    listNotificationChannels {
      id
      channelType
      channelValue
      verified
      payload
      ctime
    }
  }
`;