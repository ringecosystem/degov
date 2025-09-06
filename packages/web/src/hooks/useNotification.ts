import { useState, useCallback } from "react";

import type {
  BindNotificationChannelInput,
  VerifyNotificationChannelInput,
  ProposalSubscriptionInput,
  NotificationChannelType,
} from "@/services/graphql/types/notifications";
import { NotificationService } from "@/services/notification";

export const useNotification = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bindNotificationChannel = useCallback(
    async (input: BindNotificationChannelInput) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await NotificationService.bindNotificationChannel(input);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const resendOTP = useCallback(
    async (type: NotificationChannelType, value: string) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await NotificationService.resendOTP(type, value);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const verifyNotificationChannel = useCallback(
    async (input: VerifyNotificationChannelInput) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await NotificationService.verifyNotificationChannel(input);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const subscribeProposal = useCallback(
    async (input: ProposalSubscriptionInput) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await NotificationService.subscribeProposal(input);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const unsubscribeProposal = useCallback(
    async (daoCode: string, proposalId: string) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await NotificationService.unsubscribeProposal(daoCode, proposalId);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    error,
    bindNotificationChannel,
    resendOTP,
    verifyNotificationChannel,
    subscribeProposal,
    unsubscribeProposal,
  };
};