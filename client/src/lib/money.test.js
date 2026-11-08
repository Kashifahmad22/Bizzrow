import test from "node:test";
import assert from "node:assert/strict";
import { multiplyRounded, proportionalCents } from "./money.js";
import { estimateReturnRefund } from "./returnMath.js";

test("checkout and return preview use decimal half-up", () => {
  for (const [quantity, expected] of [[1.005, 1.01], [2.675, 2.68], [1.015, 1.02]]) {
    assert.equal(multiplyRounded(1, quantity), expected);
  }
  assert.equal(proportionalCents(100, 0.145, 1), 15);
  assert.equal(estimateReturnRefund([{ product: "p", quantity: 1, subtotal: 1 }], 1,
    [{ productId: "p", quantity: 0.145 }]), 0.15);
});
