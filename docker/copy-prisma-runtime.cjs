const fs = require("fs");
const path = require("path");

const sourceRoot = "/app/node_modules";
const targetRoot = "/app/prisma-runtime/node_modules";
const seen = new Set();

function copyPackage(name, optional = false) {
  if (seen.has(name)) {
    return;
  }

  const packageJsonPath = path.join(sourceRoot, name, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    if (optional) {
      return;
    }
    throw new Error(`Cannot find package ${name}`);
  }

  seen.add(name);
  const packageDir = path.dirname(packageJsonPath);
  const targetDir = path.join(targetRoot, name);

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(packageDir, targetDir, {
    recursive: true,
    dereference: true,
  });

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  for (const dependency of Object.keys(packageJson.dependencies || {})) {
    copyPackage(dependency);
  }
  for (const dependency of Object.keys(packageJson.optionalDependencies || {})) {
    copyPackage(dependency, true);
  }
}

for (const dependency of ["@prisma/client", "prisma"]) {
  copyPackage(dependency);
}

fs.cpSync(path.join(sourceRoot, ".prisma"), path.join(targetRoot, ".prisma"), {
  recursive: true,
  dereference: true,
});
fs.cpSync(path.join(sourceRoot, ".bin"), path.join(targetRoot, ".bin"), {
  recursive: true,
  dereference: true,
});
