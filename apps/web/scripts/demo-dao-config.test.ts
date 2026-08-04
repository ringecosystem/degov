import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { isDemoDaoConfig } from "../src/utils/is-demo-dao.ts";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("demo DAO detection uses the stable DAO code", () => {
  assert.equal(isDemoDaoConfig({ code: "degov-demo-dao" }), true);
  assert.equal(isDemoDaoConfig({ code: "kton-dao" }), false);
  assert.equal(isDemoDaoConfig(undefined), false);
});

test("layout and hooks do not detect demo DAO by display name", () => {
  assert.doesNotMatch(readSource("src/app/layout.tsx"), /name\s*===\s*["']DeGov Demo DAO["']/);
  assert.doesNotMatch(readSource("src/hooks/useIsDemoDao.ts"), /name\s*===\s*["']DeGov Demo DAO["']/);
});

test("remote config does not fallback to bundled demo config when API mode fails", () => {
  const source = readSource("src/app/_server/config-remote.ts");

  assert.match(source, /const requiresOrigin = !process\.env\.NEXT_PUBLIC_DEGOV_DAO/);
  assert.match(source, /Unable to resolve request origin for remote config/);
  assert.doesNotMatch(source, /fallback to local/);
});
