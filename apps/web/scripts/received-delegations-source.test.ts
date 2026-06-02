import assert from "node:assert/strict";
import test from "node:test";

import {
  GET_DELEGATES,
  GET_DELEGATES_CONNECTION,
} from "../src/services/graphql/queries/delegates.ts";

test("received delegations list query reads current delegates", () => {
  assert.match(GET_DELEGATES, /delegates\s*\(/);
  assert.match(GET_DELEGATES, /\bfromDelegate\b/);
  assert.match(GET_DELEGATES, /\btoDelegate\b/);
  assert.match(GET_DELEGATES, /\bisCurrent\b/);
  assert.match(GET_DELEGATES, /\bpower\b/);
});

test("received delegations count query matches the delegates source", () => {
  assert.match(GET_DELEGATES_CONNECTION, /delegatesConnection\s*\(/);
  assert.match(GET_DELEGATES_CONNECTION, /totalCount/);
});
