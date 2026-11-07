import { test } from "node:test";
import assert from "node:assert/strict";
import { formatINR } from "./format.js";

test("currency formatting preserves paise without changing whole-rupee display", () => {
  assert.equal(formatINR(100), "₹100");
  assert.equal(formatINR(90.25), "₹90.25");
  assert.equal(formatINR(-10.25), "-₹10.25");
});
