import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  expectedSiweContextFromConfig,
  validateSiweContext,
  type SiweContext,
} from "../src/app/api/common/siwe-context.ts";

const validConfig = {
  siteUrl: "https://degov-dev.vercel.app",
  chain: { id: 46 },
};

const issuedNonce = "nonce-123";
const now = new Date("2026-04-16T12:00:00.000Z");
const validSiweContext: SiweContext = {
  domain: "degov-dev.vercel.app",
  uri: "https://degov-dev.vercel.app",
  chainId: 46,
  nonce: issuedNonce,
  expirationTime: "2026-04-16T12:05:00.000Z",
  notBefore: "2026-04-16T11:55:00.000Z",
};

function expectedContext() {
  return {
    ...expectedSiweContextFromConfig(validConfig, issuedNonce),
    now,
  };
}

test("SIWE context validation accepts the configured domain, URI, chain and nonce", () => {
  assert.doesNotThrow(() => {
    validateSiweContext(validSiweContext, expectedContext());
  });
});

test("SIWE context validation rejects a mismatched domain", () => {
  assert.throws(
    () =>
      validateSiweContext(
        { ...validSiweContext, domain: "evil.example" },
        expectedContext()
      ),
    /domain/
  );
});

test("SIWE context validation rejects a mismatched URI", () => {
  assert.throws(
    () =>
      validateSiweContext(
        { ...validSiweContext, uri: "https://evil.example" },
        expectedContext()
      ),
    /URI/
  );
});

test("SIWE context validation rejects an unsupported chainId", () => {
  assert.throws(
    () =>
      validateSiweContext(
        { ...validSiweContext, chainId: 1 },
        expectedContext()
      ),
    /chainId/
  );
});

test("SIWE context validation rejects a mismatched nonce", () => {
  assert.throws(
    () =>
      validateSiweContext(
        { ...validSiweContext, nonce: "different-nonce" },
        expectedContext()
      ),
    /nonce/
  );
});

test("SIWE context validation rejects expired messages", () => {
  assert.throws(
    () =>
      validateSiweContext(
        {
          ...validSiweContext,
          expirationTime: "2026-04-16T11:59:59.000Z",
        },
        expectedContext()
      ),
    /expired/
  );
});

test("SIWE context validation rejects invalid expirationTime strings", () => {
  assert.throws(
    () =>
      validateSiweContext(
        {
          ...validSiweContext,
          expirationTime: "not-a-date",
        },
        expectedContext()
      ),
    /expirationTime is not a valid date/
  );
});

test("SIWE context validation rejects messages that are not yet valid", () => {
  assert.throws(
    () =>
      validateSiweContext(
        {
          ...validSiweContext,
          notBefore: "2026-04-16T12:00:01.000Z",
        },
        expectedContext()
      ),
    /not yet valid/
  );
});

test("SIWE context validation rejects invalid notBefore strings", () => {
  assert.throws(
    () =>
      validateSiweContext(
        {
          ...validSiweContext,
          notBefore: "not-a-date",
        },
        expectedContext()
      ),
    /notBefore is not a valid date/
  );
});

test("login route binds SIWE verify to the issued nonce, domain and current time", () => {
  const loginRouteSource = readFileSync(
    new URL("../src/app/api/auth/login/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(loginRouteSource, /siweMessage\.verify\(\{/);
  assert.match(loginRouteSource, /domain: expectedSiweContext\.domain/);
  assert.match(loginRouteSource, /nonce: expectedSiweContext\.nonce/);
  assert.match(loginRouteSource, /time: verificationTime\.toISOString\(\)/);
  assert.match(loginRouteSource, /validateSiweContext\(fields\.data/);
});
