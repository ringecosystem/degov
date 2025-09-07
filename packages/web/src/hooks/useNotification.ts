import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  BindNotificationChannelInput,
  VerifyNotificationChannelInput,
  ProposalSubscriptionInput,
  NotificationChannelType,
} from "@/services/graphql/types/notifications";
import { NotificationService } from "@/services/notification";
import { useSiweAuth } from "@/hooks/useSiweAuth";

// Query keys
const NOTIFICATION_KEYS = {
  all: ['notifications'] as const,
  channels: () => [...NOTIFICATION_KEYS.all, 'channels'] as const,
};

// Hook for listing notification channels
export const useNotificationChannels = () => {
  const { authenticate } = useSiweAuth();

  const queryFn = useMemo(() => {
    return async () => {
      try {
        return await NotificationService.listNotificationChannels();
      } catch (error: any) {
        const status = error?.response?.status;
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
  const { data: channels, isLoading, error } = useNotificationChannels();

  const emailChannel = channels?.find(
    (channel) => channel.channelType === 'EMAIL' && Boolean(channel.channelValue)
  );
  
  return {
    emailAddress: emailChannel?.channelValue,
    channels,
    isLoading,
    error,
  };
};

// Mutation hooks
export const useBindNotificationChannel = () => {
  const queryClient = useQueryClient();
  const { authenticate } = useSiweAuth();

  return useMutation({
    mutationFn: async (input: BindNotificationChannelInput) => {
      try {
        return await NotificationService.bindNotificationChannel(input);
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.bindNotificationChannel(input);
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

export const useResendOTP = () => {
  const { authenticate } = useSiweAuth();
  return useMutation({
    mutationFn: async ({ type, value }: { type: NotificationChannelType; value: string }) => {
      try {
        return await NotificationService.resendOTP(type, value);
      } catch (error: any) {
        const status = error?.response?.status;
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
      } catch (error: any) {
        const status = error?.response?.status;
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
      } catch (error: any) {
        const status = error?.response?.status;
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
    mutationFn: async ({ daoCode, proposalId }: { daoCode: string; proposalId: string }) => {
      try {
        return await NotificationService.unsubscribeProposal(daoCode, proposalId);
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401) {
          const res = await authenticate();
          if (res?.success) {
            return await NotificationService.unsubscribeProposal(daoCode, proposalId);
          }
        }
        throw error;
      }
    },
  });
};
