#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "smoke-postgres-init.mjs",
);

const script = await readFile(scriptPath, "utf8");

assert.match(script, /const dockerNetworkArgs = isLinux \? \["--network", "host"\] : \[\]/);
assert.match(script, /FROM pg_catalog\.pg_class/);
assert.match(script, /pg_catalog\.pg_namespace/);
assert.match(script, /n\.nspname = 'public'/);

console.log("Postgres initialization smoke script tests passed");
