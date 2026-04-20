import { NextResponse } from "next/server";

import { Resp } from "@/types/api";

import * as config from "../common/config";
import { resolveEnsRecord } from "../common/ens-cache";

import type { NextRequest } from "next/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const DEFAULT_ENS_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_ENS_RATE_LIMIT_MAX_BUCKETS = 1000;
const ensRateLimitBuckets = new Map<string, RateLimitBucket>();

function ensRateLimitPerMinute() {
  const value = Number(process.env.DEGOV_ENS_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_ENS_RATE_LIMIT_PER_MINUTE;
}

function ensRateLimitMaxBuckets() {
  const value = Number(process.env.DEGOV_ENS_RATE_LIMIT_MAX_BUCKETS);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_ENS_RATE_LIMIT_MAX_BUCKETS;
}

function clientIdentity(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedFor?.split(",").at(-1)?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  return `${ip}:${userAgent}`;
}

function checkEnsRateLimit(request: NextRequest) {
  const now = Date.now();
  const key = clientIdentity(request);
  const windowMs = 60 * 1000;
  const limit = ensRateLimitPerMinute();
  const existing = ensRateLimitBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    while (ensRateLimitBuckets.size >= ensRateLimitMaxBuckets()) {
      const oldestKey = ensRateLimitBuckets.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) break;
      ensRateLimitBuckets.delete(oldestKey);
    }

    ensRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  existing.count += 1;
  if (existing.count <= limit) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = checkEnsRateLimit(request);
    if (!rateLimit.allowed) {
      return NextResponse.json(Resp.err("too many ENS lookup requests"), {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds ?? 1),
        },
      });
    }

    const address = request.nextUrl.searchParams.get("address");
    const name = request.nextUrl.searchParams.get("name");
    const degovConfig = await config.degovConfig(request);
    const record = await resolveEnsRecord(degovConfig, { address, name });

    return NextResponse.json(Resp.ok(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ENS lookup failed";
    return NextResponse.json(Resp.err(message), { status: 400 });
  }
}
