"use server";

import { headers } from "next/headers";

export async function getRequestHost(): Promise<string | null> {
  const hdr = await headers();

  const authority = hdr.get(":authority");
  if (authority) {
    return authority;
  }
  return hdr.get("host");
}
