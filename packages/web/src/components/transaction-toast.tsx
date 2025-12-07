import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { useWaitForTransactionReceipt } from "wagmi";

import { useLatestCallback } from "@/hooks/useLatestCallback";

import { TransactionStatus } from "./transaction-status";

import type { WaitForTransactionReceiptErrorType } from "viem";
import type { Config } from "wagmi";
import type { WaitForTransactionReceiptData } from "wagmi/query";

export type SuccessType = (
  data: WaitForTransactionReceiptData<Config, number>
) => void;
export type ErrorType = (
  error: WaitForTransactionReceiptErrorType
) => void | null;

interface TransactionToastProps {
  hash: `0x${string}`;
  onSuccess?: SuccessType;
  onError?: ErrorType;
}

export function TransactionToast({
  hash,
  onSuccess,
  onError,
}: TransactionToastProps) {
  const toastIdRef = useRef<string | number>(0);
  const onSuccessLatest = useLatestCallback<SuccessType>(onSuccess);
  const onErrorLatest = useLatestCallback<ErrorType>(onError);

  const {
    data: receipt,
    error,
    isLoading: isPending,
    isSuccess,
    isError,
  } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
      staleTime: Infinity,
    },
  });

  useEffect(() => {
    if (isPending && !toastIdRef.current) {
      toastIdRef.current = toast.loading(
        <TransactionStatus status="pending" transactionHash={hash} />,
        {
          position: "top-right",
          autoClose: 5000,
        }
      );
    }

    if (isSuccess && toastIdRef.current) {
      if (toast.isActive(toastIdRef.current)) {
        toast.update(toastIdRef.current, {
          render: <TransactionStatus status="success" transactionHash={hash} />,
          type: "success",
          isLoading: false,
          autoClose: 5000,
          closeButton: true,
          onClose: () => {
            onSuccessLatest?.(receipt);
          },
        });
      } else {
        toast.success(
          <TransactionStatus status="success" transactionHash={hash} />,
          {
            autoClose: 5000,
            closeButton: true,
            onClose: () => {
              onSuccessLatest?.(receipt);
            },
          }
        );
      }
    }

    if (isError && toastIdRef.current) {
      if (toast.isActive(toastIdRef.current)) {
        toast.update(toastIdRef.current, {
          render: <TransactionStatus status="failed" transactionHash={hash} />,
          type: "error",
          isLoading: false,
          autoClose: 5000,
          closeButton: true,
          onClose: () => {
            onErrorLatest?.(error);
          },
        });
      } else {
        toast.error(
          <TransactionStatus status="failed" transactionHash={hash} />,
          {
            autoClose: 5000,
            closeButton: true,
            onClose: () => {
              onErrorLatest?.(error);
            },
          }
        );
      }
    }
  }, [
    hash,
    isPending,
    isSuccess,
    isError,
    receipt,
    error,
    onSuccessLatest,
    onErrorLatest,
  ]);

  useEffect(() => {
    return () => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
    };
  }, []);

  return null;
}
