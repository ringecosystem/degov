const fs = require("fs");
const Module = require("module");
const path = require("path");

const sourceRoot = "/app/node_modules";
const targetRoot = "/app/prisma-runtime/node_modules";
const seen = new Set();

function copyPackage(name, optional = false, fromDir = "/app") {
  const packageJsonPath = findPackageJson(name, fromDir);
  if (!fs.existsSync(packageJsonPath)) {
    if (optional) {
      return;
    }
    throw new Error(`Cannot find package ${name}`);
  }

  const packageDir = path.dirname(packageJsonPath);
  const seenKey = packageDir;
  if (seen.has(seenKey)) {
    return;
  }
  seen.add(seenKey);

  const targetDir = path.join(targetRoot, path.relative(sourceRoot, packageDir));

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(packageDir, targetDir, {
    recursive: true,
    dereference: true,
  });

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  for (const dependency of Object.keys(packageJson.dependencies || {})) {
    copyPackage(dependency, false, packageDir);
  }
  for (const dependency of Object.keys(packageJson.optionalDependencies || {})) {
    copyPackage(dependency, true, packageDir);
  }
}

function findPackageJson(name, fromDir) {
  for (const nodeModulesPath of Module._nodeModulePaths(fromDir)) {
    const packageJsonPath = path.join(nodeModulesPath, name, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      return fs.realpathSync(packageJsonPath);
    }
  }

  return path.join(sourceRoot, name, "package.json");
}

for (const dependency of ["@prisma/client", "prisma"]) {
  copyPackage(dependency);
}

fs.cpSync(path.join(sourceRoot, ".prisma"), path.join(targetRoot, ".prisma"), {
  recursive: true,
  dereference: true,
});
fs.mkdirSync(path.join(targetRoot, ".bin"), { recursive: true });
fs.symlinkSync("../prisma/build/index.js", path.join(targetRoot, ".bin/prisma"));
