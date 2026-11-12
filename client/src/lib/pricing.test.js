import test from "node:test";
import assert from "node:assert/strict";
import { defaultRetailPrice, gstBreakdown, round2 } from "./pricing.js";

test("retail defaults to exactly twice the wholesale price", () => {
  for (const [wholesale, retail] of [[100, 200], [250, 500], [500, 1000], [750, 1500], [1000, 2000], [99.99, 199.98], [0.01, 0.02]]) {
    assert.equal(defaultRetailPrice(wholesale), retail);
  }
  assert.equal(defaultRetailPrice(""), 0);
});

test("GST is extracted from the inclusive price, never added on top", () => {
  assert.deepEqual(gstBreakdown(500, 18), { gstPct: 18, gstAmount: 76.27, taxableValue: 423.73 });
  assert.deepEqual(gstBreakdown(112, 12), { gstPct: 12, gstAmount: 12, taxableValue: 100 });
  assert.deepEqual(gstBreakdown(500, 0), { gstPct: 0, gstAmount: 0, taxableValue: 500 });
  assert.deepEqual(gstBreakdown("", 18), { gstPct: 0, gstAmount: 0, taxableValue: 0 });
  const { gstAmount, taxableValue } = gstBreakdown(999.99, 28);
  assert.equal(round2(gstAmount + taxableValue), 999.99);
});
