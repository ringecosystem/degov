import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  expectedSiweContextFromRequest,
  validateSiweContext,
  type SiweContext,
} from "../src/app/api/common/siwe-context.ts";

const validConfig = {
  chain: { id: 46 },
};

const issuedNonce = "nonce-123";
const now = new Date("2026-04-16T12:00:00.000Z");
const validSiweContext: SiweContext = {
  domain: "preview.degov.example",
  uri: "https://preview.degov.example",
  chainId: 46,
  nonce: issuedNonce,
  expirationTime: "2026-04-16T12:05:00.000Z",
  notBefore: "2026-04-16T11:55:00.000Z",
};

function requestHeaders() {
  return new Headers({
    host: "internal.example",
    "x-forwarded-host": "preview.degov.example",
    "x-forwarded-proto": "https",
  });
}

function expectedContext() {
  return {
    ...expectedSiweContextFromRequest(
      validConfig,
      requestHeaders(),
      issuedNonce
    ),
    now,
  };
}

test("SIWE context expectation derives domain and URI from request Origin when it matches Host", () => {
  const context = expectedSiweContextFromRequest(
    validConfig,
    new Headers({
      host: "localhost:3000",
      origin: "http://localhost:3000",
    }),
    issuedNonce
  );

  assert.equal(context.domain, "localhost:3000");
  assert.equal(context.uri, "http://localhost:3000");
});

test("SIWE context expectation derives domain and URI from forwarded request headers", () => {
  const context = expectedSiweContextFromRequest(
    validConfig,
    requestHeaders(),
    issuedNonce
  );

  assert.equal(context.domain, "preview.degov.example");
  assert.equal(context.uri, "https://preview.degov.example");
});

test("SIWE context validation accepts the configured domain, URI, chain and nonce", () => {
  assert.doesNotThrow(() => {
    validateSiweContext(validSiweContext, expectedContext());
  });
});

test("SIWE context validation rejects a domain that mismatches the request origin", () => {
  assert.throws(
    () =>
      validateSiweContext(
        { ...validSiweContext, domain: "evil.example" },
        expectedContext()
      ),
    /domain/
  );
});

test("SIWE context validation rejects a URI that mismatches the request origin", () => {
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
  assert.match(loginRouteSource, /expectedSiweContextFromRequest/);
  assert.match(loginRouteSource, /request\.headers/);
  assert.match(loginRouteSource, /validateSiweContext\(fields\.data/);
});
