"use server";

import { headers } from "next/headers";

export async function getRequestHost(): Promise<string | null> {
  const hdr = await headers();
  return hdr.get("host");
}
