const test = require("node:test");
const assert = require("node:assert/strict");
const { computeSaleTotals, validateExpectedTotal, validateReviewedItems } = require("../utils/saleMath");

const first = "0123456789abcdef01234567";
const second = "abcdef0123456789abcdef01";
const third = "abcdef0123456789abcdef02";
const reviewedItems = [
  { productId: first, quantity: 1, unitPrice: 100 },
  { productId: second, quantity: 2, unitPrice: 91 },
];
const items = [
  { product: first, quantity: 1, unitPrice: 100 },
  { product: second, quantity: 2, unitPrice: 91 },
];
const conflict = (error) => error.status === 409 && /review the updated cart/i.test(error.message);

test("reviewed lines accept matching server calculations and are optional for legacy requests", () => {
  const computed = computeSaleTotals({ items });
  assert.equal(computed.total, 282);
  assert.doesNotThrow(() => validateReviewedItems({ reviewedItems: [...reviewedItems].reverse() }, computed.items));
  assert.doesNotThrow(() => validateExpectedTotal({ expectedTotal: 282 }, computed.total));
  assert.doesNotThrow(() => validateReviewedItems({}, computed.items));
  assert.doesNotThrow(() => validateReviewedItems({
    reviewedItems: [{ productId: first.toUpperCase(), quantity: 1, unitPrice: "100.00" }, reviewedItems[1]],
  }, computed.items));
});

test("changed prices including offsetting changes are rejected even when total is unchanged", () => {
  const oneChange = computeSaleTotals({ items: [{ ...items[0], unitPrice: 101 }, items[1]] });
  assert.throws(() => validateReviewedItems({ reviewedItems }, oneChange.items), conflict);
  const offset = computeSaleTotals({ items: [
    { ...items[0], unitPrice: 110 },
    { ...items[1], unitPrice: 86 },
  ] });
  assert.equal(offset.total, 282);
  assert.doesNotThrow(() => validateExpectedTotal({ expectedTotal: 282 }, offset.total));
  assert.throws(() => validateReviewedItems({ reviewedItems }, offset.items), conflict);
});

test("changed quantities and missing, duplicate, unexpected, or invalid lines are rejected", () => {
  const invalid = [
    [reviewedItems[0]],
    [...reviewedItems, reviewedItems[0]],
    [reviewedItems[0], reviewedItems[0]],
    [reviewedItems[0], { ...reviewedItems[1], productId: third }],
    [reviewedItems[0], { ...reviewedItems[1], quantity: 3 }],
    [reviewedItems[0], { ...reviewedItems[1], quantity: "2" }],
    [reviewedItems[0], { ...reviewedItems[1], unitPrice: 91.001 }],
    [reviewedItems[0], { ...reviewedItems[1], unitPrice: null }],
    [reviewedItems[0], null],
    null,
  ];
  for (const snapshot of invalid) assert.throws(() => validateReviewedItems({ reviewedItems: snapshot }, items), conflict);
  assert.throws(() => validateReviewedItems({ reviewedItems }, [items[0], items[0]]), conflict);
  assert.throws(() => validateReviewedItems({ reviewedItems }, [items[0], items[0]], { checkPrices: false }), conflict);
  assert.throws(() => validateReviewedItems({ reviewedItems }, [items[0], { ...items[1], product: third }], { checkPrices: false }), conflict);
  assert.doesNotThrow(() => validateReviewedItems({ reviewedItems }, items.map(({ product, quantity }) => ({ product, quantity })), { checkPrices: false }));
});
