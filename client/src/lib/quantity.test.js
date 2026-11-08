import test from "node:test";
import assert from "node:assert/strict";
import { addQuantity, subtractQuantity, stepQuantity } from "./quantity.js";

test("return quantity display avoids common floating-point residues", () => {
  assert.equal(subtractQuantity(0.3, 0.2), 0.1);
  assert.equal(subtractQuantity(1.23456, 0.23456), 1);
  assert.equal(addQuantity(0.23456, 1), 1.23456);
});

test("quantity controls produce valid three-decimal quantities without float artifacts", () => {
  assert.equal(stepQuantity(0.118, 5, 1), 1.118);
  assert.equal(stepQuantity(1, 1.23456, 1), 1.234);
  assert.equal(stepQuantity(1.118, 5, -1), 0.118);
});
