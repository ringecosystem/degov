"use client";

import { useState, useCallback } from "react";
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
}

export const EmailBindForm = ({ onVerified }: EmailBindFormProps) => {
  // Use the new hooks directly
  const bindEmailMutation = useBindNotificationChannel();
  const resendOTPMutation = useResendOTP();
  const verifyEmailMutation = useVerifyNotificationChannel();

  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownDuration, setCountdownDuration] = useState(60);
  const [countdownKey, setCountdownKey] = useState(0);
  const [channelId, setChannelId] = useState<string | null>(null);

  const emailSchema = z.string().email();
  const isEmailValid = emailSchema.safeParse(email).success;

  const mutationLoading =
    bindEmailMutation.isPending ||
    resendOTPMutation.isPending ||
    verifyEmailMutation.isPending;

  const handleSendVerification = useCallback(async () => {
    if (!email || !isEmailValid || mutationLoading) return;

    const mutation = channelId ? resendOTPMutation : bindEmailMutation;
    const mutationParams = channelId 
      ? { type: "EMAIL" as const, value: email }
      : { type: "EMAIL" as const, value: email };
    
    mutation.mutate(mutationParams, {
      onSuccess: (data) => {
        if (data.code === 0) {
          setChannelId(data.id);
          setCountdownDuration(data.rateLimit || 60);
          setCountdownActive(true);
          setCountdownKey((k) => k + 1);
        } else {
          toast.error(data.message || "Failed to send verification code");
        }
      },
      onError: (error: Error) => {
        toast.error(error.message || "Failed to send verification code");
      },
    });
  }, [
    email,
    isEmailValid,
    channelId,
    mutationLoading,
    resendOTPMutation,
    bindEmailMutation,
  ]);

  const handleVerifyCode = useCallback(async () => {
    if (!verificationCode || !channelId || mutationLoading) return;

    verifyEmailMutation.mutate(
      { id: channelId, otpCode: verificationCode },
      {
        onSuccess: (data) => {
          if (data.code === 0) {
            toast.success("Email verified successfully");
            onVerified(email);
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
    verificationCode,
    channelId,
    mutationLoading,
    verifyEmailMutation,
    email,
    onVerified,
  ]);

  return (
    <DropdownMenuContent
      className="rounded-[26px] border-grey-1 bg-dark p-[20px] shadow-card min-w-[320px] w-[calc(100vw-40px)] max-w-[400px] lg:w-[400px]"
      align="end"
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-[100px] px-[10px] text-[16px] font-normal"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button
                    onClick={handleSendVerification}
                    disabled={
                      !email ||
                      !isEmailValid ||
                      countdownActive ||
                      mutationLoading
                    }
                    className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] w-[95px]"
                    size="sm"
                  >
                    {mutationLoading ? (
                      "Sending..."
                    ) : countdownActive ? (
                      <Countdown
                        key={countdownKey}
                        start={countdownDuration}
                        onEnd={() => setCountdownActive(false)}
                      />
                    ) : channelId ? (
                      "Resend"
                    ) : (
                      "Send"
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isEmailValid && email.length > 0 && (
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
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-[100px] px-[10px] text-[16px] font-normal"
            />
            <Button
              onClick={handleVerifyCode}
              disabled={!verificationCode || mutationLoading}
              className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] w-[95px]"
              size="sm"
            >
              {mutationLoading ? "Verifying..." : "Verify"}
            </Button>
          </div>
        </div>
      </div>
    </DropdownMenuContent>
  );
};
