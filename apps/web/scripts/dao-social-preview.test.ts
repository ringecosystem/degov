import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildProposalDirectoryMetadata,
  buildProposalMetadata,
  buildSiteMetadata,
  SOCIAL_PREVIEW_IMAGE_HEIGHT,
  SOCIAL_PREVIEW_IMAGE_PATH,
  SOCIAL_PREVIEW_IMAGE_TYPE,
  SOCIAL_PREVIEW_IMAGE_WIDTH,
} from "../src/lib/metadata.ts";
import {
  getPublicOriginFromEnvironment,
  getPublicOriginFromHeaders,
  getPublicOriginFromHost,
  shouldUseEnvironmentSiteUrl,
  shouldUseRequestSiteUrl,
  withRequestSiteUrl,
} from "../src/lib/request-origin.ts";

import type { Config } from "../src/types/config.ts";
import type { Metadata } from "next";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const imagePath = path.join(
  rootDir,
  "apps/web/public",
  SOCIAL_PREVIEW_IMAGE_PATH.slice(1)
);

const demoConfig: Config = {
  name: "Demo DeGov DAO With A Very Long Name 演示 🗳️",
  code: "demo",
  logo: "https://demo.degov.ai/logo.png",
  siteUrl: "https://demo.degov.ai",
  description: "Demo DAO",
  links: {},
  wallet: { walletConnectProjectId: "abc" },
  chain: {
    id: 1,
    name: "Ethereum",
    logo: "https://demo.degov.ai/chain.png",
    rpcs: ["https://rpc.example.com"],
    explorers: ["https://etherscan.io"],
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
      priceId: "ethereum",
    },
  },
  contracts: {
    governor: "0x0000000000000000000000000000000000000001",
    governorToken: {
      address: "0x0000000000000000000000000000000000000002",
      standard: "ERC20",
    },
  },
  treasuryAssets: [],
  indexer: {
    endpoint: "https://indexer.degov.ai/demo/graphql",
    startBlock: 1,
  },
};

function readPngDimensions(buffer: Buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getFirstOpenGraphImage(metadata: Metadata) {
  const images = metadata.openGraph?.images;
  assert.ok(Array.isArray(images), "Open Graph image list is required");
  assert.equal(images.length, 1, "metadata should use one deterministic fallback");
  const image = images[0];
  assert.equal(typeof image, "object", "Open Graph image must carry dimensions");

  return image;
}

function assertSocialMetadata(metadata: Metadata, expectedUrl: string) {
  const imageUrl = `https://demo.degov.ai${SOCIAL_PREVIEW_IMAGE_PATH}`;
  const openGraphImage = getFirstOpenGraphImage(metadata);

  assert.equal(metadata.openGraph?.url, expectedUrl);
  assert.deepEqual(openGraphImage, {
    url: imageUrl,
    width: SOCIAL_PREVIEW_IMAGE_WIDTH,
    height: SOCIAL_PREVIEW_IMAGE_HEIGHT,
    type: SOCIAL_PREVIEW_IMAGE_TYPE,
    alt: openGraphImage.alt,
  });
  assert.match(String(openGraphImage.alt), /Demo DeGov DAO/);
  assert.equal(metadata.twitter?.card, "summary_large_image");
  assert.deepEqual(metadata.twitter?.images, [
    {
      url: imageUrl,
      alt: openGraphImage.alt,
    },
  ]);
  assert.ok(!imageUrl.includes("vercel.app"), "image URL must not use preview host");
}

test("DAO social preview fallback is a public 1200x630 PNG asset", () => {
  const buffer = readFileSync(imagePath);
  const dimensions = readPngDimensions(buffer);

  assert.equal(dimensions.width, SOCIAL_PREVIEW_IMAGE_WIDTH);
  assert.equal(dimensions.height, SOCIAL_PREVIEW_IMAGE_HEIGHT);
  assert.ok(buffer.length > 10_000, "fallback image should not be an empty placeholder");
});

test("DAO public metadata uses host-correct large-image social previews", () => {
  assertSocialMetadata(buildSiteMetadata(demoConfig), "https://demo.degov.ai");
  assertSocialMetadata(
    buildProposalDirectoryMetadata(demoConfig),
    "https://demo.degov.ai/proposals"
  );
  assertSocialMetadata(
    buildProposalMetadata({
      config: demoConfig,
      proposalId:
        "0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878",
      title:
        "Fund grants for builders with emoji ✅, ENS names like alice.eth, and multilingual summaries",
      description:
        "<p>Allocate funds safely without leaking private voting state into the public share card.</p>",
    }),
    "https://demo.degov.ai/proposal/0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878"
  );
});

test("request host overrides stale config site URL for public metadata", () => {
  const configFromRemote = {
    ...demoConfig,
    siteUrl: "https://degov-dev.vercel.app",
  };
  const config = withRequestSiteUrl(
    configFromRemote,
    getPublicOriginFromHost("demo.degov.ai")
  );

  assertSocialMetadata(buildSiteMetadata(config), "https://demo.degov.ai");
  assertSocialMetadata(
    buildProposalMetadata({
      config,
      proposalId:
        "0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878",
      title: "Fix stale production origin",
      description: "Use the current DAO host for public sharing metadata.",
    }),
    "https://demo.degov.ai/proposal/0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878"
  );
});

test("single DAO mode only overrides known stale Vercel config origins", () => {
  const staleVercelConfig = {
    ...demoConfig,
    siteUrl: "https://degov-dev.vercel.app",
  };

  assert.equal(
    shouldUseRequestSiteUrl({
      config: staleVercelConfig,
      requestOrigin: "https://demo.degov.ai",
      requiresOrigin: false,
    }),
    true
  );
  assert.equal(
    shouldUseRequestSiteUrl({
      config: staleVercelConfig,
      requestOrigin: "https://evil.example",
      requiresOrigin: false,
    }),
    false
  );
  assert.equal(
    shouldUseRequestSiteUrl({
      config: demoConfig,
      requestOrigin: "https://evil.example",
      requiresOrigin: false,
    }),
    false
  );
});

test("request site URL override happens after remote config cache lookup", () => {
  const source = readFileSync(
    path.join(rootDir, "apps/web/src/app/_server/config-remote.ts"),
    "utf8"
  );
  const cacheReturnIndex = source.indexOf("const result = await get();");
  const overrideIndex = source.indexOf("shouldUseRequestSiteUrl", cacheReturnIndex);

  assert.ok(cacheReturnIndex >= 0, "config cache result must be read explicitly");
  assert.ok(
    overrideIndex > cacheReturnIndex,
    "request host override must run after cache lookup so cache hits are normalized"
  );
});

test("request host override rejects private or invalid hosts", () => {
  assert.equal(getPublicOriginFromHost("127.0.0.1:3000"), null);
  assert.equal(getPublicOriginFromHost("[::1]:3000"), null);
  assert.equal(getPublicOriginFromHost("::1"), null);
  assert.equal(getPublicOriginFromHost("localhost:3000"), null);
  assert.equal(getPublicOriginFromHost("demo.degov.ai@evil.com"), null);
  assert.equal(getPublicOriginFromHost("demo.degov.ai/path"), null);
  assert.equal(getPublicOriginFromHost("demo.degov.ai?x=1"), null);
  assert.equal(getPublicOriginFromHost("demo.degov.ai#fragment"), null);
  assert.equal(getPublicOriginFromHost("not a host"), null);
});

test("request host override prefers forwarded public host on Vercel aliases", () => {
  const headers = new Headers({
    host: "degov-dev.vercel.app",
    "x-forwarded-host": "demo.degov.ai",
  });
  const requestOrigin = getPublicOriginFromHeaders(headers);
  const config = {
    ...demoConfig,
    siteUrl: "https://degov-dev.vercel.app",
  };

  assert.equal(requestOrigin, "https://demo.degov.ai");
  assert.equal(
    shouldUseRequestSiteUrl({
      config,
      requestOrigin,
      requiresOrigin: false,
    }),
    true
  );
  assertSocialMetadata(
    buildSiteMetadata(withRequestSiteUrl(config, requestOrigin)),
    "https://demo.degov.ai"
  );
});

test("production environment origin overrides stale Vercel request hosts", () => {
  const requestOrigin = getPublicOriginFromHeaders(
    new Headers({ host: "degov-dev.vercel.app" })
  );
  const environmentOrigin = getPublicOriginFromEnvironment({
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "demo.degov.ai",
  });
  const config = {
    ...demoConfig,
    siteUrl: "https://degov-dev.vercel.app",
  };

  assert.equal(requestOrigin, "https://degov-dev.vercel.app");
  assert.equal(environmentOrigin, "https://demo.degov.ai");
  assert.equal(
    shouldUseEnvironmentSiteUrl({ requestOrigin, environmentOrigin }),
    true
  );
  assertSocialMetadata(
    buildSiteMetadata(withRequestSiteUrl(config, environmentOrigin)),
    "https://demo.degov.ai"
  );
});

test("explicit public site URL environment accepts full HTTPS origins", () => {
  assert.equal(
    getPublicOriginFromEnvironment({
      DEGOV_PUBLIC_SITE_URL: "https://demo.degov.ai",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "degov-dev.vercel.app",
    }),
    "https://demo.degov.ai"
  );
});

test("explicit public site URL environment rejects non-origin URLs", () => {
  for (const value of [
    "http://demo.degov.ai",
    "https://demo.degov.ai/path",
    "https://demo.degov.ai?x=1",
    "https://demo.degov.ai#hash",
    "https://demo.degov.ai@evil.com",
  ]) {
    assert.equal(
      getPublicOriginFromEnvironment({ DEGOV_PUBLIC_SITE_URL: value }),
      null
    );
  }
});

test("production environment origin does not replace real DAO hosts", () => {
  assert.equal(
    shouldUseEnvironmentSiteUrl({
      requestOrigin: "https://lisk.degov.ai",
      environmentOrigin: "https://demo.degov.ai",
    }),
    false
  );
});

test("private DAO routes keep explicit noindex metadata", () => {
  const privateLayouts = [
    "apps/web/src/app/profile/layout.tsx",
    "apps/web/src/app/proposals/new/layout.tsx",
    "apps/web/src/app/ai-analysis/layout.tsx",
  ];

  for (const layout of privateLayouts) {
    const source = readFileSync(path.join(rootDir, layout), "utf8");
    assert.match(source, /robots:\s*{/);
    assert.match(source, /index:\s*false/);
    assert.match(source, /follow:\s*false/);
    assert.doesNotMatch(source, /openGraph:/);
    assert.doesNotMatch(source, /twitter:/);
  }
});
