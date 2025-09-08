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

// Query keys
const NOTIFICATION_KEYS = {
  all: ["notifications"] as const,
  channels: () => [...NOTIFICATION_KEYS.all, "channels"] as const,
  subscribedDaos: () => [...NOTIFICATION_KEYS.all, "subscribedDaos"] as const,
  subscribedProposals: () =>
    [...NOTIFICATION_KEYS.all, "subscribedProposals"] as const,
};

// Hook for listing notification channels
export const useNotificationChannels = () => {
  const { authenticate } = useSiweAuth();

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.listNotificationChannels();
      } catch (error: unknown) {
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.listNotificationChannels();
          }
        }
        throw error;
      }
    };
  }, [authenticate]);

  return useQuery({
    queryKey: NOTIFICATION_KEYS.channels(),
    queryFn,
    retry: 0,
  });
};

// Hook for getting email binding status
export const useEmailBindingStatus = () => {
  const {
    data: channels,
    isLoading,
    error,
    refetch,
  } = useNotificationChannels();

  const emailChannel = channels?.find(
    (channel) => channel.channelType === "EMAIL"
  );

  return {
    isEmailBound: Boolean(emailChannel?.id),
    emailAddress: emailChannel?.channelValue,
    id: emailChannel?.id,
    isLoading,
    error,
    refresh: refetch,
  };
};

// Hook for getting subscribed DAOs (only when email is verified)
export const useSubscribedDaos = () => {
  const { emailAddress } = useEmailBindingStatus();
  const { authenticate } = useSiweAuth();

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.getSubscribedDaos();
      } catch (error: unknown) {
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
    enabled: !!emailAddress, // Only fetch when email address exists
    retry: 0,
  });
};

// Hook for getting subscribed proposals (only when email is verified)
export const useSubscribedProposals = () => {
  const { emailAddress } = useEmailBindingStatus();
  const { authenticate } = useSiweAuth();

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.getSubscribedProposals();
      } catch (error: unknown) {
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
    enabled: !!emailAddress, // Only fetch when email address exists
    retry: 0,
  });
};

// Hook for getting notification feature status
export const useNotificationFeatures = () => {
  const { emailAddress } = useEmailBindingStatus();
  const { data: subscribedDaos, isLoading, error } = useSubscribedDaos();
  console.log("subscribedDaos", subscribedDaos);

  const notificationFeatures = useMemo(() => {
    if (!subscribedDaos || !emailAddress) {
      return {
        newProposals: false,
        votingEndReminder: false,
      };
    }

    // Check if any DAO has the specified features enabled
    const hasNewProposals = subscribedDaos.some((dao) =>
      dao.features.some((feature) => feature.name === "PROPOSAL_NEW")
    );

    const hasVotingEndReminder = subscribedDaos.some((dao) =>
      dao.features.some((feature) => feature.name === "VOTE_END")
    );

    return {
      newProposals: hasNewProposals,
      votingEndReminder: hasVotingEndReminder,
    };
  }, [subscribedDaos, emailAddress]);

  return {
    ...notificationFeatures,
    isLoading,
    error,
    emailAddress,
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
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
  const { authenticate } = useSiweAuth();
  return useMutation({
    mutationFn: async (input: ProposalSubscriptionInput) => {
      try {
        return await NotificationService.subscribeProposal(input);
      } catch (error: unknown) {
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.subscribeProposal(input);
          }
        }
        throw error;
      }
    },
  });
};

export const useUnsubscribeProposal = () => {
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
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
        const status =
          error && typeof error === "object" && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
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
