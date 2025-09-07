"use client";

import { useReducer, useCallback } from "react";
import { toast } from "react-toastify";
import { z } from "zod";

import { Countdown } from "@/components/countdown";
import { EmailBindIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useBindNotificationChannel,
  useResendOTP,
  useVerifyNotificationChannel,
} from "@/hooks/useNotification";

interface EmailBindFormProps {
  onVerified: (email: string) => void;
  initialEmail?: string;
  initialChannelId?: string | null;
}

interface FormState {
  email: string;
  verificationCode: string;
  channelId: string | null;
  countdown: {
    active: boolean;
    duration: number;
    key: number;
  };
}

type FormAction =
  | { type: "SET_EMAIL"; payload: string }
  | { type: "SET_VERIFICATION_CODE"; payload: string }
  | { type: "SET_CHANNEL_ID"; payload: string }
  | { type: "START_COUNTDOWN"; payload: number }
  | { type: "END_COUNTDOWN" }
  | { type: "RESET_VERIFICATION" };

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case "SET_EMAIL":
      return {
        ...state,
        email: action.payload,
        ...(action.payload !== state.email && {
          channelId: null,
          verificationCode: "",
          countdown: { active: false, duration: 60, key: Math.random() },
        }),
      };
    case "SET_VERIFICATION_CODE":
      return { ...state, verificationCode: action.payload };
    case "SET_CHANNEL_ID":
      return { ...state, channelId: action.payload };
    case "START_COUNTDOWN":
      return {
        ...state,
        countdown: {
          active: true,
          duration: action.payload,
          key: Math.random(),
        },
      };
    case "END_COUNTDOWN":
      return {
        ...state,
        countdown: { ...state.countdown, active: false },
      };
    case "RESET_VERIFICATION":
      return {
        ...state,
        channelId: null,
        verificationCode: "",
        countdown: { active: false, duration: 60, key: Math.random() },
      };
    default:
      return state;
  }
};

export const EmailBindForm = ({
  onVerified,
  initialEmail = "",
  initialChannelId,
}: EmailBindFormProps) => {
  const bindEmailMutation = useBindNotificationChannel();
  const resendOTPMutation = useResendOTP();
  const verifyEmailMutation = useVerifyNotificationChannel();

  const [state, dispatch] = useReducer(formReducer, {
    email: initialEmail,
    verificationCode: "",
    channelId: initialChannelId ?? null,
    countdown: { active: false, duration: 60, key: 0 },
  });

  const emailSchema = z.string().email();
  const isEmailValid = emailSchema.safeParse(state.email).success;

  const sendingLoading =
    bindEmailMutation.isPending || resendOTPMutation.isPending;
  const verifyLoading = verifyEmailMutation.isPending;

  const handleSendVerification = useCallback(async () => {
    if (!state.email || !isEmailValid || sendingLoading) return;

    const mutation = state.channelId ? resendOTPMutation : bindEmailMutation;
    const mutationParams = { type: "EMAIL" as const, value: state.email };

    mutation.mutate(mutationParams, {
      onSuccess: (data) => {
        if (data.code === 0) {
          const rate = data.rateLimit || 60;
          dispatch({ type: "SET_CHANNEL_ID", payload: data.id });
          dispatch({ type: "START_COUNTDOWN", payload: rate });
        } else {
          toast.error(data.message || "Failed to send verification code");
        }
      },
      onError: (error: any) => {
        const graphqlError = error.response?.errors?.[0]?.message;
        const errorMessage =
          graphqlError || error.message || "Failed to send verification code";
        toast.error(errorMessage);
      },
    });
  }, [
    state.email,
    state.channelId,
    isEmailValid,
    sendingLoading,
    resendOTPMutation,
    bindEmailMutation,
  ]);

  const handleVerifyCode = useCallback(async () => {
    if (!state.verificationCode || !state.channelId || verifyLoading) return;

    verifyEmailMutation.mutate(
      { id: state.channelId, otpCode: state.verificationCode },
      {
        onSuccess: (data) => {
          if (data.code === 0) {
            toast.success("Email verified successfully");
            onVerified(state.email);
          } else {
            toast.error(data.message || "Verification failed");
          }
        },
        onError: (error: Error) => {
          toast.error(error.message || "Verification failed");
        },
      }
    );
  }, [
    state.verificationCode,
    state.channelId,
    state.email,
    verifyEmailMutation,
    onVerified,
    verifyLoading,
  ]);

  return (
    <DropdownMenuContent
      className="rounded-[26px] border-grey-1 bg-dark p-[20px] shadow-card min-w-[320px] w-[calc(100vw-40px)] max-w-[400px] lg:w-[400px]"
      align="end"
      forceMount
    >
      <div className="flex flex-col gap-[20px]">
        <div className="flex items-center gap-[5px]">
          <EmailBindIcon width={24} height={24} className="text-foreground" />
          <span className="text-foreground text-[14px] font-semibold">
            Bind Email
          </span>
        </div>
        <div className="h-[1px] w-full bg-grey-2/50"></div>

        <div>
          <label className="block text-sm font-normal text-foreground mb-[5px]">
            Your Email
          </label>
          <div className="flex gap-[10px]">
            <Input
              type="email"
              placeholder="yourname@example.com"
              value={state.email}
              onChange={(e) => {
                dispatch({ type: "SET_EMAIL", payload: e.target.value });
              }}
              className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-[100px] px-[10px] text-[16px] font-normal"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button
                    onClick={handleSendVerification}
                    disabled={
                      !state.email || !isEmailValid || state.countdown.active
                    }
                    isLoading={sendingLoading}
                    className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] w-[95px]"
                    size="sm"
                  >
                    {sendingLoading ? (
                      "Sending..."
                    ) : state.countdown.active ? (
                      <Countdown
                        key={state.countdown.key}
                        start={state.countdown.duration}
                        autoStart
                        onEnd={() => {
                          dispatch({ type: "END_COUNTDOWN" });
                        }}
                      />
                    ) : (
                      "Send"
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isEmailValid && state.email.length > 0 && (
                <TooltipContent>
                  Please enter a valid email address
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>

        <div>
          <label className="block text-sm font-normal text-foreground mb-[5px]">
            Verification Code
          </label>
          <div className="flex gap-[10px]">
            <Input
              type="text"
              placeholder="e.g., 123456"
              value={state.verificationCode}
              onChange={(e) =>
                dispatch({
                  type: "SET_VERIFICATION_CODE",
                  payload: e.target.value,
                })
              }
              className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-[100px] px-[10px] text-[16px] font-normal"
            />
            <Button
              onClick={handleVerifyCode}
              disabled={!state.verificationCode}
              isLoading={verifyLoading}
              className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] w-[95px]"
              size="sm"
            >
              {verifyLoading ? "Verifying..." : "Verify"}
            </Button>
          </div>
        </div>
      </div>
    </DropdownMenuContent>
  );
};
