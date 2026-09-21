export const DISCUSSION_TARGET = `
  query DiscussionTarget($input: DiscussionTargetInput!) {
    discussionTarget(input: $input) {
      id
      space
      path
      status
    }
  }
`;

export const DISCUSSION_COMMENTS = `
  query DiscussionComments($input: DiscussionCommentsInput!) {
    discussionComments(input: $input) {
      items {
        id
        targetId
        authorAddress
        replyToId
        body
        state
        ctime
        utime
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;
