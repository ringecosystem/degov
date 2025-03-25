"use client";
import { useParams } from "next/navigation";

import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import { Profile } from "../_components/profile";

export default function Detail() {
  useDocumentTitle();
  const { address } = useParams<{ address: string }>();

  return address ? <Profile address={address as `0x${string}`} /> : null;
}
