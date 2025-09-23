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
  channels: (address?: string) =>
    [...NOTIFICATION_KEYS.all, "channels", address] as const,
  subscribedDaos: (address?: string) =>
    [...NOTIFICATION_KEYS.all, "subscribedDaos", address] as const,
  subscribedProposals: (address?: string) =>
    [...NOTIFICATION_KEYS.all, "subscribedProposals", address] as const,
};

// Hook for listing notification channels with enhanced email binding info
export const useNotificationChannels = (enabled: boolean = false) => {
  const { authenticate, address, isConnected } = useSiweAuth();

  const queryFn = useMemo(() => {
    let retryCount = 0;
    const maxRetries = 1;

    return async () => {
      try {
        return await NotificationService.listNotificationChannels(address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error) && retryCount < maxRetries) {
          retryCount++;
          const res = await authenticate();

          if (res?.success) {
            return await NotificationService.listNotificationChannels(address!);
          }
        }
        throw error;
      }
    };
  }, [authenticate, address]);

  const query = useQuery({
    queryKey: NOTIFICATION_KEYS.channels(address),
    queryFn,
    enabled: Boolean(enabled && isConnected),
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
export const useSubscribedDaos = (
  enabled: boolean = false,
  daoCode?: string
) => {
  const { authenticate, address, isConnected } = useSiweAuth();

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.getSubscribedDaos(address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.getSubscribedDaos(address!);
          }
        }
        throw error;
      }
    };
  }, [authenticate, address]);

  const queryResult = useQuery({
    queryKey: NOTIFICATION_KEYS.subscribedDaos(address),
    queryFn,
    enabled: Boolean(enabled && isConnected),
    retry: 0,
  });

  const filteredData = useMemo(() => {
    if (!queryResult.data) {
      return queryResult.data;
    }

    if (!daoCode) {
      return queryResult.data;
    }

    return queryResult.data.filter((dao) => dao.dao?.code === daoCode);
  }, [daoCode, queryResult.data]);

  return {
    ...queryResult,
    data: filteredData,
  };
};

// Hook for getting subscribed proposals (only when email is verified)
export const useSubscribedProposals = (enabled: boolean = true) => {
  const { authenticate, address, isConnected } = useSiweAuth();
  const { data: channelData } = useNotificationChannels(enabled);
  const emailAddress = channelData?.emailAddress;

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.getSubscribedProposals(address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.getSubscribedProposals(address!);
          }
        }
        throw error;
      }
    };
  }, [authenticate, address]);

  return useQuery({
    queryKey: NOTIFICATION_KEYS.subscribedProposals(address),
    queryFn,
    enabled: Boolean(enabled && isConnected && !!emailAddress),
    retry: 0,
  });
};

// Hook for getting notification feature status
export const useNotificationFeatures = (
  enabled: boolean = false,
  daoCode?: string
) => {
  const { data: subscribedDaos, isLoading, error } = useSubscribedDaos(
    enabled,
    daoCode
  );

  const notificationFeatures = useMemo(() => {
    const defaultFeatures = {
      newProposals: false,
      votingEndReminder: false,
    };

    if (!subscribedDaos || subscribedDaos.length === 0) {
      return defaultFeatures;
    }

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
  const { authenticate, address } = useSiweAuth();
  return useMutation({
    mutationFn: async ({
      type,
      value,
    }: {
      type: NotificationChannelType;
      value: string;
    }) => {
      try {
        return await NotificationService.resendOTP(type, value, address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.resendOTP(type, value, address!);
          }
        }
        throw error;
      }
    },
  });
};

export const useVerifyNotificationChannel = () => {
  const queryClient = useQueryClient();
  const { authenticate, address } = useSiweAuth();

  return useMutation({
    mutationFn: async (input: VerifyNotificationChannelInput) => {
      try {
        return await NotificationService.verifyNotificationChannel(input, address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.verifyNotificationChannel(input, address!);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.channels(address),
      });
    },
  });
};

export const useSubscribeProposal = () => {
  const queryClient = useQueryClient();
  const { authenticate, address } = useSiweAuth();
  return useMutation({
    mutationFn: async (input: ProposalSubscriptionInput) => {
      try {
        return await NotificationService.subscribeProposal(input, address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.subscribeProposal(input, address!);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedProposals(address),
      });
    },
  });
};

export const useUnsubscribeProposal = () => {
  const queryClient = useQueryClient();
  const { authenticate, address } = useSiweAuth();
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
          proposalId,
          address!
        );
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.unsubscribeProposal(
              daoCode,
              proposalId,
              address!
            );
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedProposals(address),
      });
    },
  });
};

export const useSubscribeDao = () => {
  const queryClient = useQueryClient();
  const { authenticate, address } = useSiweAuth();

  return useMutation({
    mutationFn: async (input: DaoSubscriptionInput) => {
      if (!input.daoCode) {
        throw new Error("DAO code is required");
      }
      try {
        return await NotificationService.subscribeDao(input, address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.subscribeDao(input, address!);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedDaos(address),
      });
    },
  });
};

export const useUnsubscribeDao = () => {
  const queryClient = useQueryClient();
  const { authenticate, address } = useSiweAuth();

  return useMutation({
    mutationFn: async (daoCode?: string) => {
      if (!daoCode) {
        throw new Error("DAO code is required");
      }
      try {
        return await NotificationService.unsubscribeDao(daoCode, address!);
      } catch (error: unknown) {
        if (isAuthenticationRequired(error)) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.unsubscribeDao(daoCode, address!);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.subscribedDaos(address),
      });
    },
  });
};
