"use client";
import { useAccount } from "wagmi";

import { WithConnect } from "@/components/with-connect";

import { Profile } from "./_components/profile";

export default function HomePage() {
  const { address } = useAccount();

  return (
    <WithConnect>{!!address && <Profile address={address} />}</WithConnect>
  );
}
