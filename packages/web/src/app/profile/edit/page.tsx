"use client";

import { useAccount } from "wagmi";

import NotFound from "@/components/not-found";

import { ProfileAvatar } from "./profile-avatar";
import { ProfileForm } from "./profile-form";

export default function Edit() {
  const { address } = useAccount();

  if (!address) {
    return <NotFound />;
  }
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-[20px] p-[30px]">
      <h3 className="text-[18px] font-semibold">Edit Profile</h3>
      <div className="grid w-full grid-cols-[600px_200px] gap-[20px]">
        <ProfileForm />
        <ProfileAvatar address={address} />
      </div>
    </div>
  );
}
