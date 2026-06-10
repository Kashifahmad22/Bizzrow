const test = require("node:test");
const assert = require("node:assert");
const { computeSaleTotals } = require("../utils/saleMath");

test("item percent discount", () => {
  const r = computeSaleTotals({ items: [{ unitPrice: 1000, quantity: 1, discountType: "percent", discountValue: 10 }] });
  assert.equal(r.items[0].subtotal, 900);
  assert.equal(r.total, 900);
  assert.equal(r.totalDiscount, 100);
});

test("item flat discount", () => {
  const r = computeSaleTotals({ items: [{ unitPrice: 1000, quantity: 1, discountType: "amount", discountValue: 100 }] });
  assert.equal(r.total, 900);
});

test("bill flat discount", () => {
  const r = computeSaleTotals({ items: [{ unitPrice: 50000, quantity: 1 }], billDiscount: { type: "amount", value: 2000 } });
  assert.equal(r.subtotal, 50000);
  assert.equal(r.billDiscountAmount, 2000);
  assert.equal(r.total, 48000);
});

test("combined item + bill percent", () => {
  const r = computeSaleTotals({
    items: [{ unitPrice: 1000, quantity: 2, discountType: "percent", discountValue: 10 }],
    billDiscount: { type: "percent", value: 5 },
  });
  assert.equal(r.subtotal, 1800); // 2000 - 200
  assert.equal(r.total, 1710); // 1800 - 5%
  assert.equal(r.totalDiscount, 290);
});

test("no discount is backward compatible", () => {
  const r = computeSaleTotals({ items: [{ unitPrice: 950, quantity: 1 }] });
  assert.equal(r.total, 950);
  assert.equal(r.totalDiscount, 0);
});

test("discount never exceeds the base", () => {
  const r = computeSaleTotals({ items: [{ unitPrice: 100, quantity: 1, discountType: "amount", discountValue: 500 }] });
  assert.equal(r.total, 0);
  assert.equal(r.items[0].discountAmount, 100);
});
