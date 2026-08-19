import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isProposalFeatureEnabled } from "../src/utils/proposal-features.ts";

const config = {
  features: ["proposal-comments"],
} as Parameters<typeof isProposalFeatureEnabled>[0];

test("proposal comments require both API configuration and DAO feature", () => {
  assert.equal(
    isProposalFeatureEnabled(config, "proposal-comments", "https://api.example"),
    true
  );
  assert.equal(
    isProposalFeatureEnabled(config, "proposal-comments", undefined),
    false
  );
  assert.equal(
    isProposalFeatureEnabled(
      { ...config, features: [] },
      "proposal-comments",
      "https://api.example"
    ),
    false
  );
});

test("local DAO config can still use configured Square APIs", () => {
  const remoteApi = readFileSync(
    new URL("../src/utils/remote-api.ts", import.meta.url),
    "utf8"
  );
  const clientCheck = remoteApi.match(
    /export const isDegovApiConfiguredClient = \(\) => \{([\s\S]*?)\n\};/
  )?.[1];
  const restApi = remoteApi.match(
    /export const degovRestApi = \(\): string \| undefined => \{([\s\S]*?)\n\};/
  )?.[1];

  assert.ok(clientCheck);
  assert.ok(restApi);
  assert.match(clientCheck, /NEXT_PUBLIC_DEGOV_API/);
  assert.match(restApi, /NEXT_PUBLIC_DEGOV_API/);
  assert.doesNotMatch(clientCheck, /isLocalConfigEnabledClient/);
  assert.doesNotMatch(restApi, /isLocalConfigEnabled/);
});

test("discussion stays distinct from on-chain vote reasons", () => {
  const tabs = readFileSync(
    new URL("../src/app/proposal/[id]/tabs.tsx", import.meta.url),
    "utf8"
  );
  assert.match(tabs, /activeTab === "votes"/);
  assert.match(tabs, /activeTab === "discussion"/);
  assert.match(tabs, /proposal-comments/);
  assert.match(tabs, /overflow-x-auto/);
  assert.match(tabs, /min-w-max/);
});

test("provider markdown is sanitized before rendering", () => {
  const discussion = readFileSync(
    new URL("../src/app/proposal/[id]/discussion.tsx", import.meta.url),
    "utf8"
  );
  assert.match(discussion, /DOMPurify\.sanitize\(marked\.parse/);
  assert.match(discussion, /state === "DELETED"/);
  assert.doesNotMatch(discussion, /comment\.body[^\n]*__html/);
});

test("remote GraphQL authentication is scoped to every request", () => {
  const client = readFileSync(
    new URL("../src/services/graphql/remote-client.ts", import.meta.url),
    "utf8"
  );
  const notificationClient = readFileSync(
    new URL("../src/services/graphql/notification-client.ts", import.meta.url),
    "utf8"
  );
  assert.match(client, /requestHeaders/);
  assert.match(client, /getRemoteToken\(address\)/);
  assert.match(client, /isDegovApiConfiguredClient\(\)/);
  assert.doesNotMatch(client, /setHeaders/);
  assert.match(notificationClient, /requestRemote/);
});
