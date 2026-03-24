import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ORDER_BY,
  DEFAULT_SORT_STATE,
} from "../src/components/members-table/types.ts";

test("delegates page defaults to voting power descending", () => {
  assert.deepEqual(DEFAULT_SORT_STATE, {
    field: "power",
    direction: "desc",
  });
  assert.equal(DEFAULT_ORDER_BY, "power_DESC");
});
