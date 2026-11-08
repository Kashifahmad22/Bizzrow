import test from "node:test";
import assert from "node:assert/strict";
import { calculateCheckoutPayment } from "./checkoutPayment.js";

test("checkout preview applies tender and non-cash in paise", () => {
  const base = { cash: "", upi: "", bank: "", card: "" };
  for (const [inputs, expected] of [
    [{ cash: "282" }, [282, 0, 282, 0]],
    [{ cash: "300" }, [282, 18, 282, 0]],
    [{ cash: "250" }, [250, 0, 250, 32]],
    [{ cash: "200", upi: "82" }, [200, 0, 282, 0]],
    [{ cash: "300", upi: "10" }, [272, 28, 282, 0]],
  ]) {
    const result = calculateCheckoutPayment(282, { ...base, ...inputs });
    assert.deepEqual([result.cashApplied, result.change, result.paid, result.due], expected);
  }
  assert.equal(calculateCheckoutPayment(0.3, { ...base, cash: "0.30", card: "0.01" }).change, 0.01);
});

test("checkout preview rejects invalid input, non-cash excess and zero-total tender", () => {
  const base = { cash: "", upi: "", bank: "", card: "" };
  for (const cash of ["-1", "1.001", "Infinity"]) {
    assert.ok(calculateCheckoutPayment(282, { ...base, cash }).error);
  }
  assert.ok(calculateCheckoutPayment(282, { ...base, cash: "300", upi: "282.01" }).error);
  assert.ok(calculateCheckoutPayment(0, { ...base, cash: "0.01" }).error);
  assert.equal(calculateCheckoutPayment(0, base).due, 0);
});
