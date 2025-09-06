import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  BindNotificationChannelInput,
  VerifyNotificationChannelInput,
  ProposalSubscriptionInput,
  NotificationChannelType,
  NotificationChannel,
} from "@/services/graphql/types/notifications";
import { NotificationService } from "@/services/notification";

// Query keys
const NOTIFICATION_KEYS = {
  all: ['notifications'] as const,
  channels: () => [...NOTIFICATION_KEYS.all, 'channels'] as const,
};

// Hook for listing notification channels
export const useNotificationChannels = () => {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.channels(),
    queryFn: () => NotificationService.listNotificationChannels(),
    retry: (failureCount, error: any) => {
      // Don't retry if it's an auth error
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
  });
};

// Hook for getting email binding status
export const useEmailBindingStatus = () => {
  const { data: channels, isLoading, error } = useNotificationChannels();
  
  const emailChannel = channels?.find(
    (channel) => channel.channelType === 'EMAIL' && channel.verified
  );
  
  return {
    isEmailBound: !!emailChannel,
    emailAddress: emailChannel?.channelValue,
    channels,
    isLoading,
    error,
  };
};

// Mutation hooks
export const useBindNotificationChannel = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (input: BindNotificationChannelInput) =>
      NotificationService.bindNotificationChannel(input),
    onSuccess: () => {
      // Invalidate channels query after binding
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.channels() });
    },
  });
};

export const useResendOTP = () => {
  return useMutation({
    mutationFn: ({ type, value }: { type: NotificationChannelType; value: string }) =>
      NotificationService.resendOTP(type, value),
  });
};

export const useVerifyNotificationChannel = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (input: VerifyNotificationChannelInput) =>
      NotificationService.verifyNotificationChannel(input),
    onSuccess: () => {
      // Invalidate channels query after verification
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.channels() });
    },
  });
};

export const useSubscribeProposal = () => {
  return useMutation({
    mutationFn: (input: ProposalSubscriptionInput) =>
      NotificationService.subscribeProposal(input),
  });
};

export const useUnsubscribeProposal = () => {
  return useMutation({
    mutationFn: ({ daoCode, proposalId }: { daoCode: string; proposalId: string }) =>
      NotificationService.unsubscribeProposal(daoCode, proposalId),
  });
};

// Legacy hook for backward compatibility (deprecated)
// TODO: Remove this after updating all components
export const useNotification = () => {
  console.warn('useNotification is deprecated. Use specific hooks like useBindNotificationChannel, useVerifyNotificationChannel, etc.');
  
  const bindChannelMutation = useBindNotificationChannel();
  const resendOTPMutation = useResendOTP();
  const verifyChannelMutation = useVerifyNotificationChannel();
  const subscribeProposalMutation = useSubscribeProposal();
  const unsubscribeProposalMutation = useUnsubscribeProposal();
  
  return {
    isLoading: bindChannelMutation.isPending || resendOTPMutation.isPending || 
               verifyChannelMutation.isPending || subscribeProposalMutation.isPending ||
               unsubscribeProposalMutation.isPending,
    error: bindChannelMutation.error?.message || resendOTPMutation.error?.message ||
           verifyChannelMutation.error?.message || subscribeProposalMutation.error?.message ||
           unsubscribeProposalMutation.error?.message || null,
    bindNotificationChannel: bindChannelMutation.mutateAsync,
    resendOTP: (type: NotificationChannelType, value: string) => 
      resendOTPMutation.mutateAsync({ type, value }),
    verifyNotificationChannel: verifyChannelMutation.mutateAsync,
    subscribeProposal: subscribeProposalMutation.mutateAsync,
    unsubscribeProposal: (daoCode: string, proposalId: string) =>
      unsubscribeProposalMutation.mutateAsync({ daoCode, proposalId }),
  };
};