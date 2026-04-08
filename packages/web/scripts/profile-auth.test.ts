import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SignJWT } from "jose";

import { resolveAuthPayload } from "../src/app/api/common/auth.ts";
import {
  signSiweNonceCookieValue,
  verifySiweNonceCookieValue,
} from "../src/app/api/common/siwe-nonce.ts";

const textEncoder = new TextEncoder();
const originalJwtSecretKey = process.env.JWT_SECRET_KEY;

async function signToken(address: string) {
  return new SignJWT({ address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5h")
    .sign(textEncoder.encode(process.env.JWT_SECRET_KEY!));
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

test("resolveAuthPayload falls back to bearer tokens for profile updates", async () => {
  process.env.JWT_SECRET_KEY = "test-secret";
  const token = await signToken("0xAbCdEf");

  const resolvedPayload = await resolveAuthPayload(
    new Headers({
      Authorization: `Bearer ${token}`,
    })
  );

  assert.deepEqual(resolvedPayload, { address: "0xabcdef" });
});

test("resolveAuthPayload returns null when no supported auth header is present", async () => {
  process.env.JWT_SECRET_KEY = "test-secret";

  const resolvedPayload = await resolveAuthPayload(new Headers());

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

test("SIWE auth routes use signed nonce cookies instead of relying only on process-local cache", () => {
  const nonceRouteSource = readFileSync(
    new URL("../src/app/api/auth/nonce/route.ts", import.meta.url),
    "utf8"
  );
  const loginRouteSource = readFileSync(
    new URL("../src/app/api/auth/login/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(nonceRouteSource, /signSiweNonceCookieValue/);
  assert.match(nonceRouteSource, /SIWE_NONCE_COOKIE_NAME/);
  assert.match(loginRouteSource, /verifySiweNonceCookieValue/);
  assert.match(loginRouteSource, /SIWE_NONCE_COOKIE_NAME/);
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

process.on("exit", () => {
  if (originalJwtSecretKey === undefined) {
    delete process.env.JWT_SECRET_KEY;
    return;
  }

  process.env.JWT_SECRET_KEY = originalJwtSecretKey;
});
