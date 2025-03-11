"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useAccount } from "wagmi";

import NotFound from "@/components/not-found";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { profileService } from "@/services/graphql";
import type { ProfileData } from "@/services/graphql/types/profile";

import { ProfileAvatar } from "./profile-avatar";
import { ProfileForm } from "./profile-form";

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
  const { address } = useAccount();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const { data: profileData, isFetching: isProfileLoading } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => profileService.getProfile(address as `0x${string}`),
    enabled: !!address,
  });

  // update
  const { mutate: updateProfile, isPending: isUpdating } = useMutation({
    mutationFn: (profile: Profile) =>
      profileService.updateProfile(address as `0x${string}`, profile),
  });

  const onSubmitForm = useCallback(
    async (data: FormData) => {
      try {
        console.log("data", data);
        setIsUpdatingProfile(true);
        await updateProfile(data);
        setIsUpdatingProfile(false);
      } catch (error) {
        console.warn(error);
        toast.error((error as Error)?.message || "Failed to update profile");
      } finally {
        setIsUpdatingProfile(false);
      }
    },
    [updateProfile]
  );

  const handleAvatarChange = useCallback(
    async (base64: string) => {
      try {
        setIsUpdatingAvatar(true);
        await updateProfile({
          ...(profileData?.data || {}),
          avatar: base64,
        });
        setIsUpdatingAvatar(false);
      } catch (error) {
        console.warn(error);
        toast.error((error as Error)?.message || "Failed to update avatar");
      } finally {
        setIsUpdatingAvatar(false);
      }
    },
    [updateProfile, profileData]
  );

  if (!address) {
    return <NotFound />;
  }

  if (isProfileLoading) {
    return <ProfileEditSkeleton />;
  }
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-[20px] p-[30px]">
      <h3 className="text-[18px] font-semibold">Edit Profile</h3>
      <div className="grid w-full grid-cols-[600px_200px] gap-[20px]">
        <ProfileForm
          data={profileData?.data}
          onSubmitForm={updateProfile}
          isLoading={isUpdatingProfile}
        />
        <ProfileAvatar
          address={address}
          onAvatarChange={handleAvatarChange}
          initialAvatar={profileData?.data?.avatar}
          isLoading={isUpdatingAvatar}
        />
      </div>
    </div>
  );
}
