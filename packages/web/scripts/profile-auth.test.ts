import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";

import { SignJWT } from "jose";

import {
  AUTH_COOKIE_NAME,
  resolveAuthPayload,
} from "../src/app/api/common/auth.ts";
import {
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

test("resolveAuthPayload verifies auth cookies for profile updates", async (t) => {
  setJwtSecretForTest(t, "test-secret");
  const token = await signToken("0xAbCdEf", "test-secret");

  const resolvedPayload = await resolveAuthPayload(new Headers(), {
    get(name: string) {
      return name === AUTH_COOKIE_NAME ? { value: token } : undefined;
    },
  });

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
  assert.match(loginRouteSource, /consumeSiweNonce/);
  assert.match(loginRouteSource, /verifySiweNonceCookieValue/);
  assert.match(loginRouteSource, /SIWE_NONCE_COOKIE_NAME/);
  assert.doesNotMatch(loginRouteSource, /nonceCache/);
});

test("login issues the auth token as an HttpOnly secure SameSite cookie", () => {
  const loginRouteSource = readFileSync(
    new URL("../src/app/api/auth/login/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(loginRouteSource, /AUTH_COOKIE_NAME/);
  assert.match(loginRouteSource, /value: token/);
  assert.match(loginRouteSource, /httpOnly: true/);
  assert.match(loginRouteSource, /secure: true/);
  assert.match(loginRouteSource, /sameSite: "lax"/);
  assert.match(loginRouteSource, /Resp\.ok\(\{ authenticated: true \}\)/);
  assert.doesNotMatch(loginRouteSource, /Resp\.ok\(\{ token \}\)/);
});

test("client no longer persists auth tokens in localStorage or sends bearer auth to local APIs", () => {
  const tokenManagerSource = readFileSync(
    new URL("../src/lib/auth/token-manager.ts", import.meta.url),
    "utf8"
  );
  const graphqlServiceSource = readFileSync(
    new URL("../src/services/graphql/index.ts", import.meta.url),
    "utf8"
  );
  const siweServiceSource = readFileSync(
    new URL("../src/lib/auth/siwe-service.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(tokenManagerSource, /localStorage/);
  assert.doesNotMatch(graphqlServiceSource, /Authorization: `Bearer/);
  assert.match(graphqlServiceSource, /credentials: "same-origin"/);
  assert.doesNotMatch(siweServiceSource, /setToken\(localResult\.token/);
  assert.match(siweServiceSource, /\/api\/auth\/logout/);
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
