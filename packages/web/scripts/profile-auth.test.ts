import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";

import { SignJWT } from "jose";

import { resolveAuthPayload } from "../src/app/api/common/auth.ts";
import {
  checkSiweLoginAddressRequest,
  checkSiweLoginFailureBackoff,
  checkSiweLoginRequest,
  checkSiweNonceRequest,
  createSiweRequestIdentity,
  recordSiweLoginFailure,
  resetSiweLoginFailures,
  SIWE_ABUSE_BUCKET_LIMITS,
  SIWE_LOGIN_FAILURE_BACKOFF,
  SIWE_LOGIN_RATE_LIMIT,
  SIWE_NONCE_RATE_LIMIT,
  SiweAbuseControlStore,
} from "../src/app/api/common/siwe-abuse-controls.ts";
import {
  siweNonceExpiresAt,
  siweNonceIsUsable,
  signSiweNonceCookieValue,
  verifySiweNonceCookieValue,
} from "../src/app/api/common/siwe-nonce.ts";

const textEncoder = new TextEncoder();

async function signToken(address: string, jwtSecretKey: string) {
  return new SignJWT({ address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5h")
    .sign(textEncoder.encode(jwtSecretKey));
}

function setJwtSecretForTest(t: TestContext, value: string | undefined) {
  const previousJwtSecretKey = process.env.JWT_SECRET_KEY;
  t.after(() => {
    if (previousJwtSecretKey === undefined) {
      delete process.env.JWT_SECRET_KEY;
      return;
    }

    process.env.JWT_SECRET_KEY = previousJwtSecretKey;
  });

  if (value === undefined) {
    delete process.env.JWT_SECRET_KEY;
    return;
  }

  process.env.JWT_SECRET_KEY = value;
}

test("resolveAuthPayload keeps backwards compatibility with x-degov-auth-payload", async () => {
  const payload = { address: "0xabcDEF" };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");

  const resolvedPayload = await resolveAuthPayload(
    new Headers({
      "x-degov-auth-payload": encodedPayload,
    })
  );

  assert.deepEqual(resolvedPayload, payload);
});

test("resolveAuthPayload falls back to bearer tokens for profile updates", async (t) => {
  setJwtSecretForTest(t, "test-secret");
  const token = await signToken("0xAbCdEf", "test-secret");

  const resolvedPayload = await resolveAuthPayload(
    new Headers({
      Authorization: `Bearer ${token}`,
    })
  );

  assert.deepEqual(resolvedPayload, { address: "0xabcdef" });
});

test("resolveAuthPayload returns null when no supported auth header is present", async (t) => {
  setJwtSecretForTest(t, "test-secret");

  const resolvedPayload = await resolveAuthPayload(new Headers());

  assert.equal(resolvedPayload, null);
});

test("resolveAuthPayload returns null for malformed legacy auth payloads", async () => {
  const resolvedPayload = await resolveAuthPayload(
    new Headers({
      "x-degov-auth-payload": "not-base64",
    })
  );

  assert.equal(resolvedPayload, null);
});

test("resolveAuthPayload returns null when bearer auth is configured without a JWT secret", async (t) => {
  const token = await signToken("0xAbCdEf", "signing-secret");
  setJwtSecretForTest(t, undefined);
  const resolvedPayload = await resolveAuthPayload(
    new Headers({
      Authorization: `Bearer ${token}`,
    })
  );

  assert.equal(resolvedPayload, null);
});

test("SIWE nonce cookies round-trip across route instances", async () => {
  const jwtSecretKey = "test-secret";
  const signedNonce = await signSiweNonceCookieValue("nonce-123", jwtSecretKey);

  const resolvedNonce = await verifySiweNonceCookieValue(
    signedNonce,
    jwtSecretKey
  );

  assert.equal(resolvedNonce, "nonce-123");
});

test("SIWE nonce cookies reject tampered values", async () => {
  const jwtSecretKey = "test-secret";
  const signedNonce = await signSiweNonceCookieValue("nonce-123", jwtSecretKey);

  const resolvedNonce = await verifySiweNonceCookieValue(
    `${signedNonce}tampered`,
    jwtSecretKey
  );

  assert.equal(resolvedNonce, null);
});

test("profile route uses the auth helper instead of decoding a missing header directly", () => {
  const profileRouteSource = readFileSync(
    new URL("../src/app/api/profile/[address]/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(profileRouteSource, /resolveAuthPayload/);
  assert.doesNotMatch(profileRouteSource, /Buffer\.from\(encodedPayload!/);
});

test("SIWE auth routes use a DB-backed nonce store with a signed nonce cookie", () => {
  const nonceRouteSource = readFileSync(
    new URL("../src/app/api/auth/nonce/route.ts", import.meta.url),
    "utf8"
  );
  const loginRouteSource = readFileSync(
    new URL("../src/app/api/auth/login/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(nonceRouteSource, /storeSiweNonce/);
  assert.match(nonceRouteSource, /signSiweNonceCookieValue/);
  assert.match(nonceRouteSource, /SIWE_NONCE_COOKIE_NAME/);
  assert.match(nonceRouteSource, /checkSiweNonceRequest/);
  assert.match(loginRouteSource, /consumeSiweNonce/);
  assert.match(loginRouteSource, /verifySiweNonceCookieValue/);
  assert.match(loginRouteSource, /SIWE_NONCE_COOKIE_NAME/);
  assert.match(loginRouteSource, /checkSiweLoginRequest/);
  assert.match(loginRouteSource, /checkSiweLoginAddressRequest/);
  assert.match(loginRouteSource, /checkSiweLoginFailureBackoff/);
  assert.match(loginRouteSource, /recordSiweLoginFailure/);
  assert.doesNotMatch(loginRouteSource, /nonceCache/);
});

test("SIWE login route only uses address controls after signature verification", () => {
  const loginRouteSource = readFileSync(
    new URL("../src/app/api/auth/login/route.ts", import.meta.url),
    "utf8"
  );
  const verifyIndex = loginRouteSource.indexOf(
    "fields = await siweMessage.verify"
  );
  const addressIndex = loginRouteSource.indexOf(
    "const address = fields.data.address.toLowerCase()"
  );
  const addressThrottleIndex = loginRouteSource.indexOf(
    "checkSiweLoginAddressRequest(address)"
  );
  const addressFailureIndex = loginRouteSource.indexOf(
    "checkSiweLoginFailureBackoff(\n      identity,\n      address"
  );
  const invalidSignatureFailureIndex = loginRouteSource.indexOf(
    'recordSiweLoginFailure(\n        "invalid_message_or_signature",\n        identity\n      )'
  );

  assert.ok(verifyIndex > 0);
  assert.ok(addressIndex > verifyIndex);
  assert.ok(addressThrottleIndex > addressIndex);
  assert.ok(addressFailureIndex > addressIndex);
  assert.ok(invalidSignatureFailureIndex > 0);
  assert.doesNotMatch(loginRouteSource, /siweMessage\.address/);
  assert.doesNotMatch(loginRouteSource, /attemptedAddress/);
});

test("SIWE nonce store makes nonces short-lived and single-use", () => {
  const nonceStoreSource = readFileSync(
    new URL("../src/app/api/common/siwe-nonce-store.ts", import.meta.url),
    "utf8"
  );
  const now = new Date("2026-04-16T00:00:00.000Z");
  const expiresAt = siweNonceExpiresAt(now);

  assert.equal(siweNonceIsUsable(expiresAt, now), true);
  assert.equal(siweNonceIsUsable(expiresAt, expiresAt), false);
  assert.match(nonceStoreSource, /delete from d_siwe_nonce/);
  assert.match(nonceStoreSource, /expires_at > \$\{now\.toISOString\(\)\}/);
  assert.match(nonceStoreSource, /returning nonce/);
});

test("SIWE nonce requests are throttled by client identity", () => {
  const store = new SiweAbuseControlStore();
  const identity = createSiweRequestIdentity(
    new Headers({
      "x-real-ip": "203.0.113.10",
      "user-agent": "nonce-test-agent",
    })
  );
  const now = Date.parse("2026-04-16T00:00:00.000Z");

  assert.equal(identity.ip, "203.0.113.10");

  for (let index = 0; index < SIWE_NONCE_RATE_LIMIT.ipLimit; index += 1) {
    assert.equal(checkSiweNonceRequest(identity, store, now).allowed, true);
  }

  const throttled = checkSiweNonceRequest(identity, store, now);
  assert.equal(throttled.allowed, false);
  assert.equal(throttled.reason, "nonce_ip_rate_limited");
  assert.equal(throttled.retryAfterSeconds, 60);

  assert.equal(
    checkSiweNonceRequest(
      identity,
      store,
      now + SIWE_NONCE_RATE_LIMIT.windowMilliseconds
    ).allowed,
    true
  );
});

test("SIWE request identity prefers trusted normalized IP sources", () => {
  assert.equal(
    createSiweRequestIdentity(
      new Headers({
        "cf-connecting-ip": "192.0.2.44",
        "x-forwarded-for": "198.51.100.1, 198.51.100.2",
      })
    ).ip,
    "192.0.2.44"
  );
  assert.equal(
    createSiweRequestIdentity(
      new Headers({
        "x-real-ip": "[2001:db8::1]:443",
        "x-forwarded-for": "198.51.100.1",
      })
    ).ip,
    "2001:db8::1"
  );
  assert.equal(
    createSiweRequestIdentity(
      new Headers({
        "x-forwarded-for": "spoofed, 198.51.100.10:1234",
      })
    ).ip,
    "198.51.100.10"
  );
  assert.equal(
    createSiweRequestIdentity(
      new Headers({
        "x-forwarded-for": "spoofed, also-spoofed",
      })
    ).ip,
    "unknown"
  );
});

test("SIWE login attempts are throttled by IP and address", () => {
  const store = new SiweAbuseControlStore();
  const identity = createSiweRequestIdentity(
    new Headers({
      "x-real-ip": "198.51.100.25",
      "user-agent": "login-test-agent",
    })
  );
  const address = "0x0000000000000000000000000000000000000001";
  const now = Date.parse("2026-04-16T00:00:00.000Z");

  for (let index = 0; index < SIWE_LOGIN_RATE_LIMIT.ipLimit; index += 1) {
    assert.equal(checkSiweLoginRequest(identity, store, now).allowed, true);
  }

  const ipThrottled = checkSiweLoginRequest(identity, store, now);
  assert.equal(ipThrottled.allowed, false);
  assert.equal(ipThrottled.reason, "login_ip_rate_limited");

  for (let index = 0; index < SIWE_LOGIN_RATE_LIMIT.addressLimit; index += 1) {
    assert.equal(
      checkSiweLoginAddressRequest(address, store, now).allowed,
      true
    );
  }

  const addressThrottled = checkSiweLoginAddressRequest(address, store, now);
  assert.equal(addressThrottled.allowed, false);
  assert.equal(addressThrottled.reason, "login_address_rate_limited");
});

test("SIWE failed login backoff is temporary, resettable, and observable", (t) => {
  const store = new SiweAbuseControlStore();
  const identity = createSiweRequestIdentity(
    new Headers({
      "cf-connecting-ip": "192.0.2.44",
      "user-agent": "failure-test-agent",
    })
  );
  const address = "0x0000000000000000000000000000000000000002";
  const now = Date.parse("2026-04-16T00:00:00.000Z");
  const warnings: unknown[] = [];
  const previousWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  t.after(() => {
    console.warn = previousWarn;
  });

  for (
    let index = 0;
    index < SIWE_LOGIN_FAILURE_BACKOFF.threshold - 1;
    index += 1
  ) {
    assert.equal(
      recordSiweLoginFailure(
        "invalid_nonce",
        identity,
        address,
        store,
        now
      ).allowed,
      true
    );
  }

  const locked = recordSiweLoginFailure(
    "invalid_nonce",
    identity,
    address,
    store,
    now
  );
  assert.equal(locked.allowed, false);
  assert.equal(locked.reason, "login_failure_backoff");
  assert.equal(locked.retryAfterSeconds, 60);
  assert.equal(
    checkSiweLoginFailureBackoff(identity, address, store, now).allowed,
    false
  );
  assert.equal(warnings.length, SIWE_LOGIN_FAILURE_BACKOFF.threshold);
  assert.deepEqual((warnings.at(-1) as unknown[])[0], "siwe_login_failure");
  assert.equal(
    ((warnings.at(-1) as unknown[])[1] as { reason: string }).reason,
    "invalid_nonce"
  );

  assert.equal(
    checkSiweLoginFailureBackoff(
      identity,
      address,
      store,
      now + SIWE_LOGIN_FAILURE_BACKOFF.baseLockMilliseconds
    ).allowed,
    true
  );

  recordSiweLoginFailure("invalid_nonce", identity, address, store, now);
  resetSiweLoginFailures(identity, address, store);
  assert.equal(
    checkSiweLoginFailureBackoff(identity, address, store, now).allowed,
    true
  );
});

test("SIWE abuse buckets evict stale entries and enforce caps", (t) => {
  const rateLimitStore = new SiweAbuseControlStore();
  const now = Date.parse("2026-04-16T00:00:00.000Z");
  const previousWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = previousWarn;
  });

  for (
    let index = 0;
    index < SIWE_ABUSE_BUCKET_LIMITS.maxRateLimitBuckets + 10;
    index += 1
  ) {
    checkSiweNonceRequest(
      {
        ip: `198.51.100.${index}`,
        userAgent: `agent-${index}`,
        userAgentHash: `agent-${index}`,
      },
      rateLimitStore,
      now
    );
  }

  assert.equal(
    rateLimitStore.bucketCounts().rateLimit,
    SIWE_ABUSE_BUCKET_LIMITS.maxRateLimitBuckets
  );
  assert.equal(
    checkSiweNonceRequest(
      {
        ip: "203.0.113.200",
        userAgent: "fresh-agent",
        userAgentHash: "fresh-agent",
      },
      rateLimitStore,
      now + SIWE_NONCE_RATE_LIMIT.windowMilliseconds
    ).allowed,
    true
  );
  assert.equal(rateLimitStore.bucketCounts().rateLimit, 2);

  const failedLoginStore = new SiweAbuseControlStore();
  for (
    let index = 0;
    index < SIWE_ABUSE_BUCKET_LIMITS.maxFailedLoginBuckets + 10;
    index += 1
  ) {
    recordSiweLoginFailure(
      "invalid_message_or_signature",
      {
        ip: `203.0.113.${index}`,
        userAgent: `failure-agent-${index}`,
        userAgentHash: `failure-agent-${index}`,
      },
      undefined,
      failedLoginStore,
      now
    );
  }

  assert.equal(
    failedLoginStore.bucketCounts().failedLogin,
    SIWE_ABUSE_BUCKET_LIMITS.maxFailedLoginBuckets
  );
  assert.equal(
    checkSiweLoginFailureBackoff(
      {
        ip: "192.0.2.200",
        userAgent: "fresh-failure-agent",
        userAgentHash: "fresh-failure-agent",
      },
      undefined,
      failedLoginStore,
      now + SIWE_ABUSE_BUCKET_LIMITS.failureStaleMilliseconds
    ).allowed,
    true
  );
  assert.equal(failedLoginStore.bucketCounts().failedLogin, 0);
});

test("profile edit retries a 401 only after a fresh authentication attempt", () => {
  const profileEditSource = readFileSync(
    new URL("../src/app/profile/edit/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(profileEditSource, /const authResult = await authenticate\(\)/);
  assert.match(profileEditSource, /if \(!authResult\.success\)/);
  assert.match(profileEditSource, /const retryResponse = await updateProfile\(profile\)/);
});
