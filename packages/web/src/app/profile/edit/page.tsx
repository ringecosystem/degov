"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useAccount } from "wagmi";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { WithConnect } from "@/components/with-connect";
import { useSign } from "@/hooks/useSign";
import { profileService } from "@/services/graphql";
import type { ProfileData } from "@/services/graphql/types/profile";

import { ProfileAvatar } from "./profile-avatar";
import { ProfileForm } from "./profile-form";

import type { ProfileFormData } from "./profile-form";

export function ProfileEditSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-[20px] p-[30px]">
      <h3 className="text-[18px] font-semibold">Edit Profile</h3>
      <div className="grid w-full grid-cols-[600px_200px] gap-[20px]">
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
          {[
            "Display Name",
            "Delegate Statement",
            "Email",
            "X",
            "Telegram",
            "Github",
            "Discord",
          ].map((label, index) => (
            <div
              key={index}
              className="flex flex-row items-center justify-between gap-[10px]"
            >
              <div className="w-[140px] shrink-0">
                <Skeleton className="h-5 w-[100px]" />
              </div>
              <Skeleton
                className={`h-10 w-full ${index === 1 ? "h-24" : ""}`}
              />
            </div>
          ))}

          <Separator className="my-[20px] bg-border/40" />

          <div className="flex flex-row items-center justify-center gap-[20px]">
            <Skeleton className="h-10 w-[155px] rounded-[100px]" />
            <Skeleton className="h-10 w-[155px] rounded-[100px]" />
          </div>
        </div>

        <div className="flex h-[207px] flex-col items-center justify-center gap-[20px] rounded-[14px] bg-card p-[20px]">
          <Skeleton className="h-[110px] w-[110px] rounded-full" />
          <Skeleton className="h-10 w-full rounded-[100px]" />
        </div>
      </div>
    </div>
  );
}
export default function Edit() {
  const router = useRouter();
  const { address } = useAccount();
  const { signIn, isLoading: isSigningIn } = useSign();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => profileService.getProfile(address as `0x${string}`),
    enabled: !!address,
  });

  const { mutateAsync: updateProfile } = useMutation({
    mutationFn: (profile: Partial<ProfileData>) =>
      profileService.updateProfile(address as `0x${string}`, profile),
    onSuccess: (data) => {
      switch (data.code) {
        case 0:
          toast.success("Profile updated successfully", {
            onClose: () => {
              router.push(`/profile`);
            },
          });
          break;
        case 401:
          console.log("401");
          break;
        default:
          toast.error(data?.message || "Failed to update profile");
          break;
      }
    },
    onError: (error) => {
      console.log(error);
      toast.error((error as Error)?.message || "Failed to update profile");
    },
  });

  const handleSubmitForm = useCallback(
    async (data: ProfileFormData) => {
      try {
        setIsUpdatingProfile(true);
        await updateProfile({
          ...profileData?.data,
          ...data,
        })?.then(async (res) => {
          if (res.code === 401) {
            await signIn();
            await updateProfile({
              ...profileData?.data,
              ...data,
            });
          }
          setIsUpdatingProfile(false);
        });
      } finally {
        setIsUpdatingProfile(false);
      }
    },
    [updateProfile, profileData, signIn]
  );

  const handleAvatarChange = useCallback(
    async (base64: string) => {
      try {
        setIsUpdatingAvatar(true);
        await updateProfile({
          ...profileData?.data,
          avatar: base64,
        })?.then(async (res) => {
          if (res.code === 401) {
            await signIn();
            await updateProfile({
              ...profileData?.data,
              avatar: base64,
            });
          }
          setIsUpdatingAvatar(false);
        });
      } finally {
        setIsUpdatingAvatar(false);
      }
    },
    [updateProfile, profileData, signIn]
  );

  if (isProfileLoading) {
    return <ProfileEditSkeleton />;
  }
  return (
    <WithConnect>
      <div className="mx-auto w-full max-w-[820px] space-y-[20px] lg:p-[30px]">
        <h3 className="text-[18px] font-semibold">Edit Profile</h3>
        <div className="lg:hidden">
          <ProfileAvatar
            address={address}
            onAvatarChange={handleAvatarChange}
            initialAvatar={profileData?.data?.avatar}
            isLoading={isUpdatingAvatar || isSigningIn}
          />
          <ProfileForm
            data={profileData?.data}
            onSubmitForm={handleSubmitForm}
            isLoading={isUpdatingProfile || isSigningIn}
          />
        </div>

        <div className="grid w-full grid-cols-[600px_200px] gap-[20px] hidden lg:grid">
          <ProfileForm
            data={profileData?.data}
            onSubmitForm={handleSubmitForm}
            isLoading={isUpdatingProfile || isSigningIn}
          />
          <ProfileAvatar
            address={address}
            onAvatarChange={handleAvatarChange}
            initialAvatar={profileData?.data?.avatar}
            isLoading={isUpdatingAvatar || isSigningIn}
          />
        </div>
      </div>
    </WithConnect>
  );
}
