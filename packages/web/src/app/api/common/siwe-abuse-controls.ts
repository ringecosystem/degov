import { isIP } from "node:net";

type HeaderReader = {
  get(name: string): string | null;
};

export type SiweRequestIdentity = {
  ip: string;
  userAgent: string;
  userAgentHash: string;
};

export type AbuseControlDecision = {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type FailedLoginBucket = {
  failures: number;
  lockedUntil?: number;
  updatedAt: number;
};

type RateLimitRule = {
  key: string;
  limit: number;
  windowMilliseconds: number;
  reason: string;
};

export const SIWE_NONCE_RATE_LIMIT = {
  ipLimit: 30,
  userAgentLimit: 60,
  windowMilliseconds: 60_000,
} as const;

export const SIWE_LOGIN_RATE_LIMIT = {
  ipLimit: 30,
  userAgentLimit: 60,
  addressLimit: 20,
  windowMilliseconds: 60_000,
} as const;

export const SIWE_LOGIN_FAILURE_BACKOFF = {
  threshold: 5,
  baseLockMilliseconds: 60_000,
  maxLockMilliseconds: 15 * 60_000,
} as const;

export const SIWE_ABUSE_BUCKET_LIMITS = {
  maxRateLimitBuckets: 2_000,
  maxFailedLoginBuckets: 2_000,
  failureStaleMilliseconds: 30 * 60_000,
  cleanupIntervalMilliseconds: 60_000,
} as const;

export class SiweAbuseControlStore {
  private readonly rateLimitBuckets = new Map<string, RateLimitBucket>();
  private readonly failedLoginBuckets = new Map<string, FailedLoginBucket>();
  private lastCleanupAt = 0;

  checkRateLimit(
    rules: RateLimitRule[],
    now = Date.now()
  ): AbuseControlDecision {
    this.cleanup(now);

    for (const rule of rules) {
      const bucket = this.rateLimitBuckets.get(rule.key);

      if (bucket && bucket.resetAt > now && bucket.count >= rule.limit) {
        return {
          allowed: false,
          reason: rule.reason,
          retryAfterSeconds: retryAfterSeconds(bucket.resetAt, now),
        };
      }
    }

    for (const rule of rules) {
      const bucket = this.rateLimitBuckets.get(rule.key);

      if (!bucket || bucket.resetAt <= now) {
        this.rateLimitBuckets.set(rule.key, {
          count: 1,
          resetAt: now + rule.windowMilliseconds,
        });
        continue;
      }

      bucket.count += 1;
    }

    this.enforceRateLimitBucketCap();

    return { allowed: true };
  }

  checkFailureBackoff(
    keys: string[],
    now = Date.now()
  ): AbuseControlDecision {
    this.cleanup(now);

    for (const key of keys) {
      const bucket = this.failedLoginBuckets.get(key);

      if (bucket?.lockedUntil && bucket.lockedUntil > now) {
        return {
          allowed: false,
          reason: "login_failure_backoff",
          retryAfterSeconds: retryAfterSeconds(bucket.lockedUntil, now),
        };
      }
    }

    return { allowed: true };
  }

  recordLoginFailure(
    keys: string[],
    now = Date.now()
  ): FailedLoginBucket | undefined {
    this.cleanup(now);

    let strictestBucket: FailedLoginBucket | undefined;

    for (const key of keys) {
      const bucket = this.failedLoginBuckets.get(key) ?? {
        failures: 0,
        updatedAt: now,
      };
      bucket.failures += 1;
      bucket.updatedAt = now;

      if (bucket.failures >= SIWE_LOGIN_FAILURE_BACKOFF.threshold) {
        const lockMilliseconds = Math.min(
          SIWE_LOGIN_FAILURE_BACKOFF.baseLockMilliseconds *
            2 **
              (bucket.failures - SIWE_LOGIN_FAILURE_BACKOFF.threshold),
          SIWE_LOGIN_FAILURE_BACKOFF.maxLockMilliseconds
        );
        bucket.lockedUntil = now + lockMilliseconds;
      }

      this.failedLoginBuckets.set(key, bucket);

      if (
        !strictestBucket ||
        (bucket.lockedUntil ?? 0) > (strictestBucket.lockedUntil ?? 0) ||
        bucket.failures > strictestBucket.failures
      ) {
        strictestBucket = { ...bucket };
      }
    }

    this.enforceFailedLoginBucketCap();

    return strictestBucket;
  }

  resetLoginFailures(keys: string[]): void {
    for (const key of keys) {
      this.failedLoginBuckets.delete(key);
    }
  }

  clear(): void {
    this.rateLimitBuckets.clear();
    this.failedLoginBuckets.clear();
    this.lastCleanupAt = 0;
  }

  bucketCounts(): { rateLimit: number; failedLogin: number } {
    return {
      rateLimit: this.rateLimitBuckets.size,
      failedLogin: this.failedLoginBuckets.size,
    };
  }

  private cleanup(now: number): void {
    if (
      this.lastCleanupAt &&
      now - this.lastCleanupAt < SIWE_ABUSE_BUCKET_LIMITS.cleanupIntervalMilliseconds
    ) {
      return;
    }

    this.lastCleanupAt = now;

    for (const [key, bucket] of this.rateLimitBuckets) {
      if (bucket.resetAt <= now) {
        this.rateLimitBuckets.delete(key);
      }
    }

    for (const [key, bucket] of this.failedLoginBuckets) {
      const lockIsActive = !!bucket.lockedUntil && bucket.lockedUntil > now;
      const lockExpired = !!bucket.lockedUntil && bucket.lockedUntil <= now;
      const stale =
        bucket.updatedAt + SIWE_ABUSE_BUCKET_LIMITS.failureStaleMilliseconds <=
        now;

      if (!lockIsActive && (lockExpired || stale)) {
        this.failedLoginBuckets.delete(key);
      }
    }

    this.enforceRateLimitBucketCap();
    this.enforceFailedLoginBucketCap();
  }

  private enforceRateLimitBucketCap(): void {
    while (
      this.rateLimitBuckets.size >
      SIWE_ABUSE_BUCKET_LIMITS.maxRateLimitBuckets
    ) {
      const oldestKey = this.rateLimitBuckets.keys().next().value;
      if (!oldestKey) {
        break;
      }

      this.rateLimitBuckets.delete(oldestKey);
    }
  }

  private enforceFailedLoginBucketCap(): void {
    while (
      this.failedLoginBuckets.size >
      SIWE_ABUSE_BUCKET_LIMITS.maxFailedLoginBuckets
    ) {
      const oldestKey = this.failedLoginBuckets.keys().next().value;
      if (!oldestKey) {
        break;
      }

      this.failedLoginBuckets.delete(oldestKey);
    }
  }
}

const defaultSiweAbuseControlStore = new SiweAbuseControlStore();

export function createSiweRequestIdentity(
  headers: HeaderReader
): SiweRequestIdentity {
  const ip =
    normalizedSingleIp(headers.get("true-client-ip")) ||
    normalizedSingleIp(headers.get("cf-connecting-ip")) ||
    normalizedSingleIp(headers.get("x-real-ip")) ||
    normalizedSingleIp(headers.get("x-vercel-forwarded-for")) ||
    normalizedForwardedForIp(headers.get("x-forwarded-for")) ||
    "unknown";
  const userAgent = headers.get("user-agent")?.trim() || "unknown";

  return {
    ip,
    userAgent,
    userAgentHash: hashIdentityPart(userAgent),
  };
}

export function checkSiweNonceRequest(
  identity: SiweRequestIdentity,
  store = defaultSiweAbuseControlStore,
  now = Date.now()
): AbuseControlDecision {
  return store.checkRateLimit(
    [
      {
        key: `siwe:nonce:ip:${identity.ip}`,
        limit: SIWE_NONCE_RATE_LIMIT.ipLimit,
        windowMilliseconds: SIWE_NONCE_RATE_LIMIT.windowMilliseconds,
        reason: "nonce_ip_rate_limited",
      },
      {
        key: `siwe:nonce:ua:${identity.userAgentHash}`,
        limit: SIWE_NONCE_RATE_LIMIT.userAgentLimit,
        windowMilliseconds: SIWE_NONCE_RATE_LIMIT.windowMilliseconds,
        reason: "nonce_user_agent_rate_limited",
      },
    ],
    now
  );
}

export function checkSiweLoginRequest(
  identity: SiweRequestIdentity,
  store = defaultSiweAbuseControlStore,
  now = Date.now()
): AbuseControlDecision {
  return store.checkRateLimit(
    [
      {
        key: `siwe:login:ip:${identity.ip}`,
        limit: SIWE_LOGIN_RATE_LIMIT.ipLimit,
        windowMilliseconds: SIWE_LOGIN_RATE_LIMIT.windowMilliseconds,
        reason: "login_ip_rate_limited",
      },
      {
        key: `siwe:login:ua:${identity.userAgentHash}`,
        limit: SIWE_LOGIN_RATE_LIMIT.userAgentLimit,
        windowMilliseconds: SIWE_LOGIN_RATE_LIMIT.windowMilliseconds,
        reason: "login_user_agent_rate_limited",
      },
    ],
    now
  );
}

export function checkSiweLoginAddressRequest(
  address: string | undefined,
  store = defaultSiweAbuseControlStore,
  now = Date.now()
): AbuseControlDecision {
  if (!address) {
    return { allowed: true };
  }

  return store.checkRateLimit(
    [
      {
        key: `siwe:login:address:${address.toLowerCase()}`,
        limit: SIWE_LOGIN_RATE_LIMIT.addressLimit,
        windowMilliseconds: SIWE_LOGIN_RATE_LIMIT.windowMilliseconds,
        reason: "login_address_rate_limited",
      },
    ],
    now
  );
}

export function checkSiweLoginFailureBackoff(
  identity: SiweRequestIdentity,
  address?: string,
  store = defaultSiweAbuseControlStore,
  now = Date.now()
): AbuseControlDecision {
  return store.checkFailureBackoff(loginFailureKeys(identity, address), now);
}

export function recordSiweLoginFailure(
  reason: string,
  identity: SiweRequestIdentity,
  address?: string,
  store = defaultSiweAbuseControlStore,
  now = Date.now()
): AbuseControlDecision {
  const bucket = store.recordLoginFailure(
    loginFailureKeys(identity, address),
    now
  );

  console.warn("siwe_login_failure", {
    event: "siwe_login_failure",
    reason,
    ip: identity.ip,
    userAgentHash: identity.userAgentHash,
    address,
    failures: bucket?.failures ?? 0,
    lockedUntil: bucket?.lockedUntil
      ? new Date(bucket.lockedUntil).toISOString()
      : undefined,
  });

  return bucket?.lockedUntil && bucket.lockedUntil > now
    ? {
        allowed: false,
        reason: "login_failure_backoff",
        retryAfterSeconds: retryAfterSeconds(bucket.lockedUntil, now),
      }
    : { allowed: true };
}

export function resetSiweLoginFailures(
  identity: SiweRequestIdentity,
  address?: string,
  store = defaultSiweAbuseControlStore
): void {
  store.resetLoginFailures(loginFailureKeys(identity, address));
}

export function logSiweThrottle(
  event: "siwe_nonce_throttled" | "siwe_login_throttled",
  identity: SiweRequestIdentity,
  decision: AbuseControlDecision,
  address?: string
): void {
  console.warn(event, {
    event,
    reason: decision.reason,
    retryAfterSeconds: decision.retryAfterSeconds,
    ip: identity.ip,
    userAgentHash: identity.userAgentHash,
    address,
  });
}

function loginFailureKeys(
  identity: SiweRequestIdentity,
  address?: string
): string[] {
  const keys = [
    `siwe:failure:ip:${identity.ip}`,
    `siwe:failure:ua:${identity.userAgentHash}`,
  ];

  if (address) {
    keys.push(`siwe:failure:address:${address.toLowerCase()}`);
  }

  return keys;
}

function retryAfterSeconds(targetTime: number, now: number): number {
  return Math.max(1, Math.ceil((targetTime - now) / 1000));
}

function hashIdentityPart(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function normalizedForwardedForIp(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const candidates = headerValue.split(",").map((part) => part.trim());

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const normalizedIp = normalizedSingleIp(candidates[index]);
    if (normalizedIp) {
      return normalizedIp;
    }
  }

  return null;
}

function normalizedSingleIp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  let candidate = value.trim().toLowerCase();
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (candidate.includes(":") && candidate.indexOf(":") === candidate.lastIndexOf(":")) {
    candidate = candidate.split(":")[0] ?? "";
  }

  return isIP(candidate) ? candidate : null;
}
