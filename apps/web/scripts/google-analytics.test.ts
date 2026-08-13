import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoogleAnalyticsConfig,
  canUseGoogleAnalytics,
} from "../src/lib/google-analytics.ts";

test("configures individual and aggregate GA4 destinations", () => {
  assert.deepEqual(
    buildGoogleAnalyticsConfig({
      daoCode: "playground-dao",
      individualTag: "G-XC6ZKJY0MP",
      aggregateTag: "G-9F67255N5K",
    }),
    {
      loaderTag: "G-XC6ZKJY0MP",
      configCommands: [
        { tag: "G-XC6ZKJY0MP", params: undefined },
        { tag: "G-9F67255N5K", params: { dao_code: "playground-dao" } },
      ],
    }
  );
});

test("deduplicates destinations and ignores invalid IDs", () => {
  assert.deepEqual(
    buildGoogleAnalyticsConfig({
      daoCode: "lisk-dao",
      individualTag: "G-0X2S8293S1",
      aggregateTag: "G-0X2S8293S1",
    }).configCommands,
    [{ tag: "G-0X2S8293S1", params: { dao_code: "lisk-dao" } }]
  );
  assert.equal(
    buildGoogleAnalyticsConfig({
      daoCode: "demo-dao",
      aggregateTag: "not-a-measurement-id",
    }).loaderTag,
    undefined
  );
});

test("supports aggregate-only sites", () => {
  assert.deepEqual(
    buildGoogleAnalyticsConfig({
      daoCode: "new-dao",
      aggregateTag: "G-9F67255N5K",
    }),
    {
      loaderTag: "G-9F67255N5K",
      configCommands: [
        { tag: "G-9F67255N5K", params: { dao_code: "new-dao" } },
      ],
    }
  );
});

test("analytics requires explicit production deployment approval", () => {
  assert.equal(
    canUseGoogleAnalytics({
      enabled: true,
      isDemoDao: false,
    }),
    true
  );

  assert.equal(
    canUseGoogleAnalytics({
      enabled: false,
      isDemoDao: false,
    }),
    false
  );
  assert.equal(
    canUseGoogleAnalytics({
      enabled: true,
      isDemoDao: true,
    }),
    false
  );
});
