import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { threadProposalComments } from "../src/app/proposal/[id]/comment-tree.ts";
import { isProposalFeatureEnabled } from "../src/utils/proposal-features.ts";

import type { ProposalComment } from "../src/services/graphql/types/proposal-comments.ts";

const comment = (
  id: string,
  replyToId?: string,
  state: ProposalComment["state"] = "ACTIVE"
): ProposalComment => ({
  id,
  daoCode: "demo",
  chainId: 1,
  proposalId: "1",
  authorAddress: `0x${id.padStart(40, "0")}`,
  replyToId,
  body: state === "ACTIVE" ? id : null,
  state,
  ctime: "2026-08-20T00:00:00Z",
});

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

test("proposal comments preserve nested reply targets and depth", () => {
  const threaded = threadProposalComments([
    comment("1"),
    comment("2"),
    comment("3", "1"),
    comment("4", "3"),
    comment("5", "4"),
    comment("6", "1"),
  ]);

  assert.deepEqual(
    threaded.map(({ comment: item, depth, replyTarget }) => ({
      id: item.id,
      depth,
      replyTarget: replyTarget?.id,
    })),
    [
      { id: "1", depth: 0, replyTarget: undefined },
      { id: "3", depth: 1, replyTarget: "1" },
      { id: "4", depth: 2, replyTarget: "3" },
      { id: "5", depth: 3, replyTarget: "4" },
      { id: "6", depth: 1, replyTarget: "1" },
      { id: "2", depth: 0, replyTarget: undefined },
    ]
  );
});

test("proposal comment trees degrade safely for missing parents and cycles", () => {
  const threaded = threadProposalComments([
    comment("1", "missing"),
    comment("2", "3"),
    comment("3", "2"),
    comment("4", "1", "DELETED"),
  ]);

  assert.deepEqual(
    threaded.map(({ comment: item, depth }) => [item.id, depth]),
    [
      ["1", 0],
      ["4", 1],
      ["2", 0],
      ["3", 0],
    ]
  );
});

test("proposal comment trees handle large chains and cycles in linear passes", () => {
  const size = 20_000;
  const chain = Array.from({ length: size }, (_, index) =>
    comment(String(index), index === 0 ? undefined : String(index - 1))
  );
  const threadedChain = threadProposalComments(chain);
  assert.equal(threadedChain.length, size);
  assert.equal(threadedChain.at(-1)?.depth, size - 1);

  const cycle = Array.from({ length: size }, (_, index) =>
    comment(String(index), String((index + 1) % size))
  );
  const threadedCycle = threadProposalComments(cycle);
  assert.equal(threadedCycle.length, size);
  assert.ok(threadedCycle.every(({ depth }) => depth === 0));
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
