import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  overlayProfilesWithContributorPower,
  rankMembersByContributorPower,
} from "../src/app/api/common/profile-power.ts";

const getSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("member ranking uses contributor power and ctime as the tie-breaker", () => {
  const rankedMembers = rankMembersByContributorPower(
    [
      {
        id: "first",
        address: "0x1",
        ctime: "2024-01-01T00:00:00.000Z",
        power: "999",
      },
      {
        id: "second",
        address: "0x2",
        ctime: "2024-02-01T00:00:00.000Z",
        power: "1",
      },
      {
        id: "third",
        address: "0x3",
        ctime: "2024-03-01T00:00:00.000Z",
        power: "1",
      },
    ],
    new Map([
      [
        "0x1",
        {
          id: "0x1",
          power: "5",
          blockNumber: "1",
          blockTimestamp: "1",
          transactionHash: "0xhash1",
        },
      ],
      [
        "0x2",
        {
          id: "0x2",
          power: "9",
          blockNumber: "2",
          blockTimestamp: "2",
          transactionHash: "0xhash2",
        },
      ],
      [
        "0x3",
        {
          id: "0x3",
          power: "9",
          blockNumber: "3",
          blockTimestamp: "3",
          transactionHash: "0xhash3",
        },
      ],
    ])
  );

  assert.deepEqual(
    rankedMembers.map((member) => ({
      id: member.id,
      power: member.power,
      rn: member.rn,
    })),
    [
      { id: "third", power: "9", rn: 1 },
      { id: "second", power: "9", rn: 2 },
      { id: "first", power: "5", rn: 3 },
    ]
  );
});

test("profile overlays keep contributor power and default missing users to zero", () => {
  const profiles = overlayProfilesWithContributorPower(
    [
      {
        id: "alpha",
        address: "0xaaa",
        power: "100",
      },
      {
        id: "beta",
        address: "0xbbb",
      },
    ],
    new Map([
      [
        "0xaaa",
        {
          id: "0xaaa",
          power: "42",
          blockNumber: "1",
          blockTimestamp: "1",
          transactionHash: "0xhash",
        },
      ],
    ])
  );

  assert.deepEqual(
    profiles.map((profile) => ({ id: profile.id, power: profile.power })),
    [
      { id: "alpha", power: "42" },
      { id: "beta", power: "0" },
    ]
  );
});

test("route sources no longer read or write d_user.power in scoped paths", () => {
  const membersRoute = getSource("../src/app/api/degov/members/route.ts");
  const profilePullRoute = getSource("../src/app/api/profile/pull/route.ts");
  const profileRoute = getSource("../src/app/api/profile/[address]/route.ts");
  const loginRoute = getSource("../src/app/api/auth/login/route.ts");
  const syncRoute = getSource("../src/app/api/degov/sync/route.ts");

  assert.match(membersRoute, /inspectContributorsByAddress/);
  assert.doesNotMatch(membersRoute, /u\.power/);

  assert.match(profilePullRoute, /overlayProfilesWithContributorPower/);
  assert.doesNotMatch(profilePullRoute, /select \* from d_user/i);

  assert.match(profileRoute, /overlayProfileWithContributorPower/);
  assert.doesNotMatch(profileRoute, /select u\.\*/i);

  assert.doesNotMatch(loginRoute, /inspectContributor/);
  assert.doesNotMatch(loginRoute, /"power"/);
  assert.doesNotMatch(loginRoute, /power:/);

  assert.match(syncRoute, /sync\.user\.power/);
  assert.doesNotMatch(syncRoute, /update d_user set power/i);
});
