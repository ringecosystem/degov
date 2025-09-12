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

export const SUBSCRIBED_DAOS = gql`
  query SubscribedDaos {
    subscribedDaos {
      dao {
        code
        name
      }
      features {
        name
        strategy
      }
    }
  }
`;

export const SUBSCRIBED_PROPOSALS = gql`
  query SubscribedProposals {
    subscribedProposals {
      dao {
        code
        name
      }
      proposal {
        id
        proposalId
        daoCode
        title
        state
      }
      features {
        name
        strategy
      }
    }
  }
`;