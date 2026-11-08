const test = require("node:test");
const assert = require("node:assert/strict");
const { add, subtract, validateNewQuantity } = require("../utils/quantity");
const { allocateReturnItems } = require("../utils/saleMath");

test("quantity arithmetic is decimal and fails closed on unrepresentable results", () => {
  assert.equal(subtract(0.3, 0.2), 0.1);
  assert.equal(add(0.76544, 1.23456), 2);
  assert.throws(() => add(1000000000000000, 0.001), (error) => error.status === 409);
});

test("new quantities support up to three decimal places", () => {
  for (const value of [0.1, 0.01, 0.001, "1.000"]) assert.equal(validateNewQuantity(value), Number(value));
  assert.throws(() => validateNewQuantity(0.0001), /three decimal/);
  assert.throws(() => validateNewQuantity("1.0000"), /three decimal/);
  assert.throws(() => validateNewQuantity(0), /Quantity/);
});

test("historical fractional returns conserve quantity across repeated requests", () => {
  const item = { product: "p", quantity: 1.23456, returnedQty: 0, subtotal: 100 };
  const sale = { total: 100, items: [item] };
  const first = allocateReturnItems(sale, [{ productId: "p", quantity: 0.23456 }])[0];
  item.returnedQty = first.newReturnedQty;
  assert.throws(() => allocateReturnItems(sale, [{ productId: "p", quantity: 1.00001 }]), /only/);
  const last = allocateReturnItems(sale, [{ productId: "p", quantity: 1 }])[0];
  assert.equal(last.newReturnedQty, 1.23456);
  assert.equal(first.refund + last.refund, 100);
  item.returnedQty = last.newReturnedQty;
  assert.throws(() => allocateReturnItems(sale, [{ productId: "p", quantity: 0.001 }]), /only/);
  assert.throws(() => allocateReturnItems({ total: 1, items: [{ product: "p", quantity: 1 }] },
    [{ productId: "p", quantity: 0.0001 }]), /three decimal/);
  const prior = { product: "p", quantity: 1, returnedQty: 0.12345, subtotal: 100 };
  assert.equal(allocateReturnItems({ total: 100, items: [prior] },
    [{ productId: "p", quantity: 0.87655 }])[0].newReturnedQty, 1);
  assert.throws(() => allocateReturnItems({ total: 100, items: [
    { product: "p", quantity: 1.23456, subtotal: 100 },
  ] }, [{ productId: "p", quantity: 0.000001 }]), /three decimal/);
  assert.equal(allocateReturnItems({ total: 100, items: [
    { product: "p", quantity: 1.23456, subtotal: 100 },
  ] }, [{ productId: "p", quantity: 0.23456 }])[0].quantity, 0.23456);
});
