import assert from "node:assert/strict";
import { test } from "node:test";
import { distributeSplit } from "../src/core/split-edit";

test("distributeSplit fills empty parts evenly, then by share", () => {
  assert.deepEqual(distributeSplit(5_000, [2_000, 0, 0]), [2_000, 1_500, 1_500]);
  assert.deepEqual(distributeSplit(5_000, [0, 0, 0]), [1_667, 1_667, 1_666]);
  assert.deepEqual(distributeSplit(4_000, [2_000, 1_000]), [2_667, 1_333]);
});
