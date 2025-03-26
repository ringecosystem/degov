"use client";
import { useParams } from "next/navigation";

import { Profile } from "../_components/profile";

export default function Detail() {
  const { address } = useParams<{ address: string }>();

  return address ? <Profile address={address as `0x${string}`} /> : null;
}
