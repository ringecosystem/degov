"use server";

import { headers } from "next/headers";

function buildOrigin(proto: string, host: string): string | null {
  if (!/^https?$/.test(proto)) return null;
  if (!host) return null;
  return `${proto}://${host}`;
}

export async function getRequestOrigin(): Promise<string | null> {
  const hdr = await headers();

  const forwarded = hdr.get("forwarded");
  if (forwarded) {
    const protoMatch = forwarded.match(/proto=(https?)/i);
    const hostMatch = forwarded.match(/host=([^;,]+)/i);
    if (protoMatch && hostMatch) {
      const origin = buildOrigin(protoMatch[1], hostMatch[1]);
      if (origin) return origin;
    }
  }

  const proto = hdr.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    hdr.get("x-forwarded-host")?.split(",")[0]?.trim() || hdr.get("host");

  if (proto && host) {
    const origin = buildOrigin(proto, host);
    if (origin) return origin;
  }

  const referer = hdr.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}
