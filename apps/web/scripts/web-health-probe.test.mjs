import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routePath = new URL("../src/app/api/health/route.ts", import.meta.url);
const dockerfilePath = new URL("../../../docker/web.Dockerfile", import.meta.url);

test("web health route stays dependency-light", () => {
  assert.equal(existsSync(routePath), true);

  const routeSource = readFileSync(routePath, "utf8");

  assert.match(routeSource, /export async function GET\(/);
  assert.match(routeSource, /status:\s*"ok"/);
  assert.doesNotMatch(routeSource, /loadConfig|getConfig|DEGOV_CONFIG|remote|graphql|prisma|database/i);
});

test("web container healthcheck uses the lightweight health route", () => {
  const dockerfileSource = readFileSync(dockerfilePath, "utf8");

  assert.match(dockerfileSource, /HEALTHCHECK/);
  assert.match(dockerfileSource, /\/api\/health/);
  assert.doesNotMatch(dockerfileSource, /HEALTHCHECK[\s\S]*http:\/\/127\.0\.0\.1:3000\/\s/m);
});
