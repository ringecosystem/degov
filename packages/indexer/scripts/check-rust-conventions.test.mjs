#!/usr/bin/env node

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "check-rust-conventions.mjs",
);

async function writeFixture(root, files) {
  for (const [filePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
}

async function runCheck(files) {
  const root = await mkdtemp(path.join(tmpdir(), "degov-rust-conventions-"));

  try {
    await writeFixture(root, files);

    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [scriptPath], {
        env: {
          ...process.env,
          DEGOV_RUST_CONVENTIONS_ROOT: root,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (status) => {
        resolve({ status, stdout, stderr });
      });
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function testRejectsImportedTracingMacros() {
  const result = await runCheck({
    "src/lib.rs": [
      "use tracing::{debug_span, info, warn};",
      "",
      "pub fn log_stuff() {",
      '  info!("hello");',
      '  warn!("careful");',
      '  let _span = debug_span!("work");',
      "}",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tracing macros/);
}

async function testRejectsImportedInstrumentAttribute() {
  const result = await runCheck({
    "src/lib.rs": [
      "use tracing::instrument;",
      "",
      "#[instrument]",
      "pub fn load() {}",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /instrument/);
}

async function testRejectsAliasedImportedInstrumentAttribute() {
  const result = await runCheck({
    "src/lib.rs": [
      "use tracing::instrument as trace_work;",
      "",
      "#[trace_work]",
      "pub fn load() {}",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /instrument/);
}

async function testRejectsAnyhowLibraryApis() {
  const result = await runCheck({
    "src/lib.rs": [
      "pub fn parse() -> Result<(), anyhow::Error> {",
      '  anyhow::bail!("invalid");',
      "}",
      "",
      "pub fn annotate(value: anyhow::Result<()>) {",
      '  let _ = anyhow::Context::context(value, "loading");',
      "}",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /anyhow/);
}

async function testRejectsSplitEthersCrates() {
  const result = await runCheck({
    "Cargo.toml": [
      "[dependencies]",
      'ethers-core = "2"',
      'evm-provider = { package = "ethers-providers", version = "2" }',
      "",
    ].join("\n"),
    "Cargo.lock": [
      'name = "ethers-contract"',
      'name = "alloy-primitives"',
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ethers/);
}

await testRejectsImportedTracingMacros();
await testRejectsImportedInstrumentAttribute();
await testRejectsAliasedImportedInstrumentAttribute();
await testRejectsAnyhowLibraryApis();
await testRejectsSplitEthersCrates();

console.log("Rust convention check tests passed");
