"use client";

import { useTranslations } from "next-intl";
import { useReducer, useCallback, useState } from "react";
import { toast } from "react-toastify";
import { z } from "zod";

import { Countdown } from "@/components/countdown";
import { EmailBindIcon, ErrorIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  useResendOTP,
  useVerifyNotificationChannel,
} from "@/hooks/useNotification";
import { extractErrorMessage } from "@/utils/graphql-error-handler";

interface EmailBindFormProps {
  onVerified: (email: string) => void;
  countdownActive: boolean;
  countdownDuration: number;
  countdownKey: number;
  onStartCountdown: (duration: number) => void;
  onEndCountdown: () => void;
  onCountdownTick: (remaining: number) => void;
  isLoading?: boolean;
}

interface FormState {
  email: string;
  verificationCode: string;
}

type FormAction =
  | { type: "SET_EMAIL"; payload: string }
  | { type: "SET_VERIFICATION_CODE"; payload: string }
  | { type: "RESET_VERIFICATION" };

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case "SET_EMAIL":
      return {
        ...state,
        email: action.payload,
        ...(action.payload !== state.email && { verificationCode: "" }),
      };
    case "SET_VERIFICATION_CODE":
      return { ...state, verificationCode: action.payload };
    case "RESET_VERIFICATION":
      return {
        ...state,
        verificationCode: "",
      };
    default:
      return state;
  }
};

export const EmailBindForm = ({
  onVerified,
  countdownActive,
  countdownDuration,
  countdownKey,
  onStartCountdown,
  onEndCountdown,
  onCountdownTick,
  isLoading = false,
}: EmailBindFormProps) => {
  const t = useTranslations("notifications.emailBind");
  const resendOTPMutation = useResendOTP();
  const verifyEmailMutation = useVerifyNotificationChannel();

  const [state, dispatch] = useReducer(formReducer, {
    email: "",
    verificationCode: "",
  });

  const [verificationError, setVerificationError] = useState<string>("");
  const [emailError, setEmailError] = useState<string>("");
  const [sendError, setSendError] = useState<string>("");

  const emailSchema = z.string().email();
  const isEmailValid = emailSchema.safeParse(state.email).success;

  const sendingLoading = resendOTPMutation.isPending;
  const verifyLoading = verifyEmailMutation.isPending || isLoading;

  const handleSendVerification = useCallback(async () => {
    if (!state.email || sendingLoading) return;

    setSendError("");

    if (!isEmailValid) {
      setSendError(t("errors.invalidEmail"));
      return;
    }

    resendOTPMutation.mutate(
      { type: "EMAIL" as const, value: state.email },
      {
        onSuccess: (data) => {
          if (data.code === 0) {
            const rate = data.rateLimit || 60;
            onStartCountdown(rate);
            setSendError("");
          } else {
            setSendError(data.message || t("errors.sendFailed"));
          }
        },
        onError: (error: unknown) => {
          const errorMessage = extractErrorMessage(error) || t("errors.sendFailed");
          setSendError(errorMessage);
        },
      }
    );
  }, [
    state.email,
    isEmailValid,
    sendingLoading,
    resendOTPMutation,
    onStartCountdown,
    t,
  ]);

  const handleVerifyCode = useCallback(async () => {
    if (
      !state.verificationCode ||
      !state.email ||
      !isEmailValid ||
      verifyLoading
    )
      return;

    setVerificationError("");

    verifyEmailMutation.mutate(
      { type: "EMAIL", value: state.email, otpCode: state.verificationCode },
      {
        onSuccess: (data) => {
          if (data.code === 0) {
            toast.success(t("messages.verified"));
            onVerified(state.email);
            setVerificationError("");
          } else {
            setVerificationError(t("errors.invalidCode"));
          }
        },
        onError: () => {
          setVerificationError(t("errors.invalidCode"));
        },
      }
    );
  }, [
    state.verificationCode,
    state.email,
    isEmailValid,
    verifyEmailMutation,
    onVerified,
    verifyLoading,
    t,
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
            {t("title")}
          </span>
        </div>
        <div className="h-px w-full bg-grey-2/50"></div>

        <div>
          <label className="block text-sm font-normal text-foreground mb-[5px]">
            {t("yourEmail")}
          </label>
          <div className="flex gap-[10px]">
            <Input
              type="email"
              placeholder={t("placeholders.email")}
              value={state.email}
              onChange={(e) => {
                const value = e.target.value.trim();
                dispatch({ type: "SET_EMAIL", payload: value });
                setEmailError("");
                setSendError("");
                if (value && !emailSchema.safeParse(value).success) {
                  setEmailError(t("errors.invalidEmail"));
                }
              }}
              className={`flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-[100px] px-[10px] text-[16px] font-normal ${
                emailError ? "border-danger" : ""
              }`}
            />
            <Button
              onClick={handleSendVerification}
              disabled={!state.email || !isEmailValid || countdownActive}
              isLoading={sendingLoading}
              className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] w-[100px]"
              size="sm"
            >
              {countdownActive ? (
                <Countdown
                  key={countdownKey}
                  start={countdownDuration}
                  autoStart
                  onEnd={onEndCountdown}
                  onTick={onCountdownTick}
                />
              ) : (
                t("actions.send")
              )}
            </Button>
          </div>
          {(emailError || sendError) && (
            <div className="flex items-center gap-[5px] text-[12px] mt-[5px]">
              <ErrorIcon className="h-4 w-4 shrink-0 text-danger" />
              <span>{emailError || sendError}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-normal text-foreground mb-[5px]">
            {t("verificationCode")}
          </label>
          <div className="flex gap-[10px]">
            <Input
              type="text"
              placeholder={t("placeholders.code")}
              value={state.verificationCode}
              onChange={(e) => {
                dispatch({
                  type: "SET_VERIFICATION_CODE",
                  payload: e.target.value,
                });
                setVerificationError("");
              }}
              className={`flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-[100px] px-[10px] text-[16px] font-normal ${
                verificationError ? "border-danger" : ""
              }`}
            />
            <Button
              onClick={handleVerifyCode}
              disabled={!state.verificationCode}
              isLoading={verifyLoading}
              className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] w-[100px]"
              size="sm"
            >
              {t("actions.verify")}
            </Button>
          </div>
          {verificationError && (
            <div className="flex items-center gap-[5px] text-[12px] mt-[5px]">
              <ErrorIcon className="h-4 w-4 shrink-0 text-danger" />
              <span>{verificationError}</span>
            </div>
          )}
        </div>
      </div>
    </DropdownMenuContent>
  );
};
