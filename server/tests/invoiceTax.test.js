const test = require("node:test");
const assert = require("node:assert/strict");
const { gstSummary } = require("../utils/invoiceTax");

test("legacy sales without gstPct snapshots produce no GST summary", () => {
  assert.equal(gstSummary({ items: [{ subtotal: 100 }] }), null);
  assert.equal(gstSummary({ items: [] }), null);
  assert.equal(gstSummary({ items: [{ subtotal: 100, gstPct: 0 }] }), null);
  assert.equal(gstSummary({}), null);
});

test("GST is extracted from inclusive amounts and never added on top", () => {
  const summary = gstSummary({ items: [{ subtotal: 500, gstPct: 18 }] });
  assert.deepEqual(summary.rates, [{ rate: 18, inclusive: 500, taxable: 423.73, gstAmount: 76.27 }]);
  assert.equal(summary.totalTaxable, 423.73);
  assert.equal(summary.totalGst, 76.27);
  // taxable + GST reconstructs the charged inclusive amount exactly.
  assert.equal(Math.round((summary.totalTaxable + summary.totalGst) * 100) / 100, 500);
});

test("mixed GST rates group separately and zero-rated items only add taxable value", () => {
  const summary = gstSummary({
    items: [
      { subtotal: 112, gstPct: 12 },
      { subtotal: 118, gstPct: 18 },
      { subtotal: 59, gstPct: 18 },
      { subtotal: 50, gstPct: 0 },
      { subtotal: 40 }, // legacy item in a mixed sale
    ],
  });
  assert.deepEqual(summary.rates.map((entry) => entry.rate), [12, 18]);
  const at12 = summary.rates[0];
  const at18 = summary.rates[1];
  assert.deepEqual(at12, { rate: 12, inclusive: 112, taxable: 100, gstAmount: 12 });
  assert.deepEqual(at18, { rate: 18, inclusive: 177, taxable: 150, gstAmount: 27 });
  // Zero-rated and legacy inclusive amounts count toward taxable value only.
  assert.equal(summary.totalTaxable, 100 + 150 + 50 + 40);
  assert.equal(summary.totalGst, 39);
});

test("bill discounts reduce the inclusive base proportionally before extraction", () => {
  const summary = gstSummary({
    items: [
      { subtotal: 100, gstPct: 18 },
      { subtotal: 300, gstPct: 18 },
    ],
    billDiscountAmount: 40, // 10% off the 400 inclusive base
  });
  assert.deepEqual(summary.rates, [{ rate: 18, inclusive: 360, taxable: 305.08, gstAmount: 54.92 }]);
});

test("invalid values are ignored safely", () => {
  const summary = gstSummary({
    items: [{ subtotal: "bad", gstPct: 18 }, { subtotal: 118, gstPct: 18 }],
    billDiscountAmount: "junk",
  });
  assert.deepEqual(summary.rates, [{ rate: 18, inclusive: 118, taxable: 100, gstAmount: 18 }]);
});
