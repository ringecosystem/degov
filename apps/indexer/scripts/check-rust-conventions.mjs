#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const root = path.resolve(
  process.env.DEGOV_RUST_CONVENTIONS_ROOT ?? repositoryRoot,
);
const ignoredDirectories = new Set(["target", "node_modules"]);
const tracingMacroNames = new Set([
  "debug",
  "debug_span",
  "enabled",
  "error",
  "error_span",
  "event",
  "info",
  "info_span",
  "span",
  "trace",
  "trace_span",
  "warn",
  "warn_span",
]);
const forbiddenRustPatterns = [
  {
    pattern: /\btracing::[A-Za-z_]\w*!\s*\(/,
    message:
      "library Rust files must use log facade macros instead of tracing macros",
  },
  {
    pattern: /#\s*\[\s*(?:tracing::)?instrument\b/,
    message:
      "library Rust files must not use #[tracing::instrument] or #[instrument]",
  },
  {
    pattern: /\btracing_subscriber::/,
    message:
      "tracing_subscriber initialization belongs only in binary entrypoints",
  },
  {
    pattern: /\banyhow::/,
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

function getTracingImports(source) {
  const macroNames = new Set();
  const instrumentNames = new Set();
  const simpleImportPattern =
    /\buse\s+tracing::([A-Za-z_]\w*|\*)(?:\s+as\s+([A-Za-z_]\w*))?\s*;/g;
  const groupedImportPattern = /\buse\s+tracing::\{([^}]+)\}\s*;/g;
  let match;

  while ((match = simpleImportPattern.exec(source)) !== null) {
    const [, importedName, alias] = match;

    if (importedName === "*") {
      return {
        instrumentNames: new Set(["instrument"]),
        macroNames: new Set(tracingMacroNames),
      };
    }

    if (tracingMacroNames.has(importedName)) {
      macroNames.add(alias ?? importedName);
    }

    if (importedName === "instrument" && alias) {
      instrumentNames.add(alias);
    }
  }

  while ((match = groupedImportPattern.exec(source)) !== null) {
    const [, group] = match;

    for (const rawImport of group.split(",")) {
      const importMatch = rawImport
        .trim()
        .match(/^([A-Za-z_]\w*|\*)(?:\s+as\s+([A-Za-z_]\w*))?$/);

      if (!importMatch) {
        continue;
      }

      const [, importedName, alias] = importMatch;

      if (importedName === "*") {
        return {
          instrumentNames: new Set(["instrument"]),
          macroNames: new Set(tracingMacroNames),
        };
      }

      if (tracingMacroNames.has(importedName)) {
        macroNames.add(alias ?? importedName);
      }

      if (importedName === "instrument" && alias) {
        instrumentNames.add(alias);
      }
    }
  }

  return { instrumentNames, macroNames };
}

function hasImportedTracingMacro(source) {
  const { macroNames } = getTracingImports(source);

  for (const name of macroNames) {
    const macroPattern = new RegExp(`\\b${name}!\\s*\\(`);

    if (macroPattern.test(source)) {
      return true;
    }
  }

  return false;
}

function hasImportedTracingInstrument(source) {
  const { instrumentNames } = getTracingImports(source);

  for (const name of instrumentNames) {
    const instrumentPattern = new RegExp(`#\\s*\\[\\s*${name}\\b`);

    if (instrumentPattern.test(source)) {
      return true;
    }
  }

  return false;
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

    if (hasImportedTracingMacro(source) && !isBinaryEntrypoint(filePath)) {
      failures.push(
        `${relative}: library Rust files must use log facade macros instead of imported tracing macros`,
      );
    }

    if (hasImportedTracingInstrument(source) && !isBinaryEntrypoint(filePath)) {
      failures.push(`${relative}: library Rust files must not use #[instrument]`);
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

    if (
      /(^|\n)\s*(?:"ethers(?:-[\w-]+)?"|ethers(?:-[\w-]+)?)\s*=/.test(
        source,
      ) ||
      /\bpackage\s*=\s*"ethers(?:-[\w-]+)?"/.test(source) ||
      /\bname\s*=\s*"ethers(?:-[\w-]+)?"/.test(source)
    ) {
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
