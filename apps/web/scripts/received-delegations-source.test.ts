import assert from "node:assert/strict";
import test from "node:test";

import {
  GET_DELEGATES,
  GET_DELEGATES_PAGE,
} from "../src/services/graphql/queries/delegates.ts";

test("received delegations list query reads current delegates", () => {
  assert.match(GET_DELEGATES, /delegates\s*\(/);
  assert.match(GET_DELEGATES, /\bfromDelegate\b/);
  assert.match(GET_DELEGATES, /\btoDelegate\b/);
  assert.match(GET_DELEGATES, /\bisCurrent\b/);
  assert.match(GET_DELEGATES, /\bpower\b/);
});

test("received delegations page query supplies count and rows from the delegates source", () => {
  assert.match(GET_DELEGATES_PAGE, /delegatesPage\s*\(/);
  assert.match(GET_DELEGATES_PAGE, /totalCount/);
  assert.match(GET_DELEGATES_PAGE, /items\s*\{/);
  assert.match(GET_DELEGATES_PAGE, /\bfromDelegate\b/);
  assert.match(GET_DELEGATES_PAGE, /\btoDelegate\b/);
  assert.match(GET_DELEGATES_PAGE, /\bisCurrent\b/);
  assert.match(GET_DELEGATES_PAGE, /\bpower\b/);
  assert.doesNotMatch(GET_DELEGATES_PAGE, /Connection/);
});
