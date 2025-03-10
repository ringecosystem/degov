"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAccount } from "wagmi";

import NotFound from "@/components/not-found";
import { profileService } from "@/services/graphql";
import type { Profile } from "@/services/graphql/types/profile";

import { ProfileAvatar } from "./profile-avatar";
import { ProfileForm } from "./profile-form";

export default function Edit() {
  const { address } = useAccount();

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
    (data: FormData) => {
      console.log("data", data);

      updateProfile(data);
    },
    [updateProfile]
  );

  if (!address) {
    return <NotFound />;
  }
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-[20px] p-[30px]">
      <h3 className="text-[18px] font-semibold">Edit Profile</h3>
      <div className="grid w-full grid-cols-[600px_200px] gap-[20px]">
        <ProfileForm onSubmitForm={updateProfile} isLoading={isUpdating} />
        <ProfileAvatar address={address} />
      </div>
    </div>
  );
}
