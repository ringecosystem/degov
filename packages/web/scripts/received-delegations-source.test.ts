import assert from "node:assert/strict";
import test from "node:test";

import {
  GET_DELEGATE_MAPPINGS,
  GET_DELEGATE_MAPPINGS_CONNECTION,
} from "../src/services/graphql/queries/delegates.ts";

test("received delegations list query reads current delegate mappings", () => {
  assert.match(GET_DELEGATE_MAPPINGS, /delegateMappings\s*\(/);
  assert.doesNotMatch(GET_DELEGATE_MAPPINGS, /delegates\s*\(/);
  assert.match(GET_DELEGATE_MAPPINGS, /\bfrom\b/);
  assert.match(GET_DELEGATE_MAPPINGS, /\bto\b/);
  assert.match(GET_DELEGATE_MAPPINGS, /\bpower\b/);
});

test("received delegations count query matches the mappings source", () => {
  assert.match(
    GET_DELEGATE_MAPPINGS_CONNECTION,
    /delegateMappingsConnection\s*\(/
  );
  assert.doesNotMatch(GET_DELEGATE_MAPPINGS_CONNECTION, /delegatesConnection/);
  assert.match(GET_DELEGATE_MAPPINGS_CONNECTION, /totalCount/);
});
