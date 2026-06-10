import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("profile current delegation reads delegates with the current flag", () => {
  const source = readSource("src/app/profile/_components/profile.tsx");

  assert.match(source, /delegateService\.getAllDelegates/);
  assert.match(source, /fromDelegate_eq:\s*address\?\.toLowerCase\(\)/);
  assert.match(source, /isCurrent_eq:\s*true/);
  assert.doesNotMatch(source, /delegateService\.getDelegateMappings/);
});

test("received delegation surfaces keep the current flag on delegate reads", () => {
  const parent = readSource(
    "src/app/profile/_components/received-delegations.tsx"
  );

  assert.doesNotMatch(parent, /getDelegatesConnection/);
  assert.doesNotMatch(parent, /delegatesConnection/);

  const files = [
    "src/components/delegation-table/index.tsx",
    "src/components/delegation-list/index.tsx",
  ];

  for (const file of files) {
    const source = readSource(file);

    assert.match(source, /delegateService\.(getAllDelegates|getDelegatesPage)/);
    assert.match(source, /isCurrent_eq:\s*true/);
    assert.doesNotMatch(source, /getDelegatesConnection/);
    assert.doesNotMatch(source, /to_eq:/);
  }
});
