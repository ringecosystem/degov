#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set(["target", "node_modules"]);
const forbiddenRustPatterns = [
  {
    pattern: /\btracing::(?:trace|debug|info|warn|error|event|span)!\s*\(/,
    message:
      "library Rust files must use log facade macros instead of tracing macros",
  },
  {
    pattern: /#\s*\[\s*tracing::instrument\b/,
    message: "library Rust files must not use #[tracing::instrument]",
  },
  {
    pattern: /\btracing_subscriber::/,
    message:
      "tracing_subscriber initialization belongs only in binary entrypoints",
  },
  {
    pattern: /\banyhow::(?:Error|Result)\b/,
    message: "library Rust APIs must expose typed thiserror errors, not anyhow",
  },
];

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function walk(dir, shouldIncludeFile) {
  if (!(await fileExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await walk(entryPath, shouldIncludeFile)));
      }
      continue;
    }

    if (entry.isFile() && shouldIncludeFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function isBinaryEntrypoint(filePath) {
  const relative = path.relative(root, filePath).split(path.sep).join("/");

  return (
    relative === "src/main.rs" ||
    relative.startsWith("src/bin/") ||
    relative.endsWith("/src/main.rs") ||
    relative.includes("/src/bin/")
  );
}

async function checkRustFiles() {
  const failures = [];
  const rustFiles = await walk(root, (fileName) => fileName.endsWith(".rs"));

  for (const filePath of rustFiles) {
    const source = await readFile(filePath, "utf8");
    const relative = path.relative(root, filePath);

    for (const { pattern, message } of forbiddenRustPatterns) {
      if (pattern.test(source) && !isBinaryEntrypoint(filePath)) {
        failures.push(`${relative}: ${message}`);
      }
    }
  }

  return failures;
}

async function checkCargoFiles() {
  const failures = [];
  const cargoFiles = await walk(
    root,
    (fileName) => fileName === "Cargo.toml" || fileName === "Cargo.lock",
  );

  for (const filePath of cargoFiles) {
    const source = await readFile(filePath, "utf8");

    if (/(^|\n)\s*ethers\s*=|name\s*=\s*"ethers"/.test(source)) {
      failures.push(
        `${path.relative(root, filePath)}: Rust indexer must use alloy, not ethers`,
      );
    }
  }

  return failures;
}

const failures = [...(await checkRustFiles()), ...(await checkCargoFiles())];

if (failures.length > 0) {
  console.error("Rust convention check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Rust convention check passed");
