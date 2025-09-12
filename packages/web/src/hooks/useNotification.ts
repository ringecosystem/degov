import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useSiweAuth } from "@/hooks/useSiweAuth";
import type {
  VerifyNotificationChannelInput,
  ProposalSubscriptionInput,
  NotificationChannelType,
  DaoSubscriptionInput,
} from "@/services/graphql/types/notifications";
import { NotificationService } from "@/services/notification";
import { isAuthenticationRequired } from "@/utils/graphql-error-handler";

// Query keys
const NOTIFICATION_KEYS = {
  all: ["notifications"] as const,
  channels: () => [...NOTIFICATION_KEYS.all, "channels"] as const,
  subscribedDaos: () => [...NOTIFICATION_KEYS.all, "subscribedDaos"] as const,
  subscribedProposals: () =>
    [...NOTIFICATION_KEYS.all, "subscribedProposals"] as const,
};

// Hook for listing notification channels with enhanced email binding info
export const useNotificationChannels = (enabled = false) => {
  const { authenticate } = useSiweAuth();

  const queryFn = useMemo(() => {
    let retryCount = 0;
    const maxRetries = 1;

    return async () => {
      try {
        return await NotificationService.listNotificationChannels();
      } catch (error: unknown) {
        if (isAuthenticationRequired(error) && retryCount < maxRetries) {
          retryCount++;
          const res = await authenticate();

          if (res?.success) {
            return await NotificationService.listNotificationChannels();
          }
        }
        throw error;
      }
    };
  }, [authenticate]);

  const query = useQuery({
    queryKey: NOTIFICATION_KEYS.channels(),
    queryFn,
    enabled,
    retry: 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Enhanced return value with email binding info
  const enhancedData = useMemo(() => {
    if (!query.data) return null;

    const emailChannel = query.data.find(
      (channel) => channel.channelType === "EMAIL"
    );

    return {
      channels: query.data,
      isEmailBound: Boolean(emailChannel?.id),
      emailAddress: emailChannel?.channelValue || null,
    };
  }, [query.data]);

  return {
    data: enhancedData,
    error: query.error,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};

// Hook for getting subscribed DAOs (only when email is verified)
export const useSubscribedDaos = (enabled = false) => {
  const { authenticate } = useSiweAuth();

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.getSubscribedDaos();
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.getSubscribedDaos();
          }
        }
        throw error;
      }
    };
  }, [authenticate]);

  return useQuery({
    queryKey: NOTIFICATION_KEYS.subscribedDaos(),
    queryFn,
    enabled,
    retry: 0,
  });
};

// Hook for getting subscribed proposals (only when email is verified)
export const useSubscribedProposals = (enabled = true) => {
  const { authenticate } = useSiweAuth();
  const { data: channelData } = useNotificationChannels(enabled);
  const emailAddress = channelData?.emailAddress;

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.getSubscribedProposals();
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.getSubscribedProposals();
          }
        }
        throw error;
      }
    };
  }, [authenticate]);

  return useQuery({
    queryKey: NOTIFICATION_KEYS.subscribedProposals(),
    queryFn,
    enabled: enabled && !!emailAddress,
    retry: 0,
  });
};

// Hook for getting notification feature status
export const useNotificationFeatures = (enabled = false) => {
  const { data: subscribedDaos, isLoading, error } = useSubscribedDaos(enabled);

  const notificationFeatures = useMemo(() => {
    if (!subscribedDaos) {
      return {
        newProposals: false,
        votingEndReminder: false,
      };
    }

    // Check if any DAO has the specified features enabled
    const hasNewProposals = subscribedDaos.some((dao) =>
      dao.features.some(
        (feature) =>
          feature.name === "PROPOSAL_NEW" && feature.strategy === "true"
      )
    );

    const hasVotingEndReminder = subscribedDaos.some((dao) =>
      dao.features.some(
        (feature) => feature.name === "VOTE_END" && feature.strategy === "true"
      )
    );

    return {
      newProposals: hasNewProposals,
      votingEndReminder: hasVotingEndReminder,
    };
  }, [subscribedDaos]);

  return {
    ...notificationFeatures,
    isLoading,
    error,
  };
};

// Mutation hooks
export const useResendOTP = () => {
  const { authenticate } = useSiweAuth();
  return useMutation({
    mutationFn: async ({
      type,
      value,
    }: {
      type: NotificationChannelType;
      value: string;
    }) => {
      try {
        return await NotificationService.resendOTP(type, value);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.resendOTP(type, value);
          }
        }
        throw error;
      }
    },
  });
};

export const useVerifyNotificationChannel = () => {
  const queryClient = useQueryClient();
  const { authenticate } = useSiweAuth();

  return useMutation({
    mutationFn: async (input: VerifyNotificationChannelInput) => {
      try {
        return await NotificationService.verifyNotificationChannel(input);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.verifyNotificationChannel(input);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.channels() });
    },
  });
};

export const useSubscribeProposal = () => {
  const queryClient = useQueryClient();
  const { authenticate } = useSiweAuth();
  return useMutation({
    mutationFn: async (input: ProposalSubscriptionInput) => {
      try {
        return await NotificationService.subscribeProposal(input);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.subscribeProposal(input);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedProposals(),
      });
    },
  });
};

export const useUnsubscribeProposal = () => {
  const queryClient = useQueryClient();
  const { authenticate } = useSiweAuth();
  return useMutation({
    mutationFn: async ({
      daoCode,
      proposalId,
    }: {
      daoCode: string;
      proposalId: string;
    }) => {
      try {
        return await NotificationService.unsubscribeProposal(
          daoCode,
          proposalId
        );
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.unsubscribeProposal(
              daoCode,
              proposalId
            );
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedProposals(),
      });
    },
  });
};

export const useSubscribeDao = () => {
  const queryClient = useQueryClient();
  const { authenticate } = useSiweAuth();

  return useMutation({
    mutationFn: async (input: DaoSubscriptionInput) => {
      if (!input.daoCode) {
        throw new Error("DAO code is required");
      }
      try {
        return await NotificationService.subscribeDao(input);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.subscribeDao(input);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedDaos(),
      });
    },
  });
};

export const useUnsubscribeDao = () => {
  const queryClient = useQueryClient();
  const { authenticate } = useSiweAuth();

  return useMutation({
    mutationFn: async (daoCode?: string) => {
      if (!daoCode) {
        throw new Error("DAO code is required");
      }
      try {
        return await NotificationService.unsubscribeDao(daoCode);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.unsubscribeDao(daoCode);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedDaos(),
      });
    },
  });
};
