const test = require("node:test");
const assert = require("node:assert");
const {
  allocateReturnItems,
  computeReturnSettlement,
  computeReplacementCredit,
  normalizePaymentSplits,
} = require("../utils/saleMath");

const productA = "product-a";
const productB = "product-b";

test("full return allocates a bill discount proportionately and never exceeds sale total", () => {
  const sale = {
    subtotal: 100,
    total: 90,
    items: [
      { product: productA, quantity: 1, subtotal: 60 },
      { product: productB, quantity: 1, subtotal: 40 },
    ],
  };
  const returns = allocateReturnItems(sale, [
    { productId: productA, quantity: 1 },
    { productId: productB, quantity: 1 },
  ]);
  assert.deepEqual(returns.map((item) => item.refund), [54, 36]);
  assert.equal(returns.reduce((sum, item) => sum + item.refund, 0), sale.total);
});

test("partial quantity returns conserve cents and reach the allocated line total", () => {
  const sale = {
    total: 10,
    items: [{ product: productA, quantity: 3, returnedQty: 0, subtotal: 10 }],
  };
  const first = allocateReturnItems(sale, [{ productId: productA, quantity: 1 }]);
  sale.items[0].returnedQty = first[0].newReturnedQty;
  const second = allocateReturnItems(sale, [{ productId: productA, quantity: 1 }]);
  sale.items[0].returnedQty = second[0].newReturnedQty;
  const third = allocateReturnItems(sale, [{ productId: productA, quantity: 1 }]);
  assert.equal(first[0].refund + second[0].refund + third[0].refund, 10);
});

test("partial returns use the discounted line allocation, not its pre-bill-discount subtotal", () => {
  const sale = {
    total: 90,
    items: [
      { product: productA, quantity: 2, returnedQty: 0, subtotal: 60 },
      { product: productB, quantity: 1, returnedQty: 0, subtotal: 40 },
    ],
  };
  const first = allocateReturnItems(sale, [{ productId: productA, quantity: 1 }]);
  sale.items[0].returnedQty = first[0].newReturnedQty;
  const second = allocateReturnItems(sale, [{ productId: productA, quantity: 1 }]);
  sale.items[0].returnedQty = second[0].newReturnedQty;
  const finalLine = allocateReturnItems(sale, [{ productId: productB, quantity: 1 }]);
  assert.equal(first[0].refund, 27);
  assert.equal(second[0].refund, 27);
  assert.equal(finalLine[0].refund, 36);
  assert.equal(first[0].refund + second[0].refund + finalLine[0].refund, sale.total);
});

test("duplicate product return rows are consolidated before availability validation", () => {
  const sale = {
    total: 20,
    items: [{ product: productA, quantity: 2, subtotal: 20 }],
  };
  assert.throws(
    () => allocateReturnItems(sale, [
      { productId: productA, quantity: 2 },
      { productId: productA, quantity: 1 },
    ]),
    /only 2 returnable/
  );
});

test("a repeated full return cannot be accepted after the sale quantity is already returned", () => {
  const sale = {
    total: 25,
    items: [{ product: productA, quantity: 1, returnedQty: 1, subtotal: 25 }],
  };
  assert.throws(
    () => allocateReturnItems(sale, [{ productId: productA, quantity: 1 }]),
    /only 0 returnable/
  );
});

test("return settlement separates actual payment from carried credit", () => {
  const result = computeReturnSettlement({
    total: 100,
    returnedAmount: 0,
    dueAmount: 0,
    amountPaid: 60,
    creditApplied: 40,
    payments: [{ method: "cash", amount: 60 }],
  }, 100);
  assert.equal(result.paidRefund, 60);
  assert.equal(result.creditRefund, 40);
  assert.equal(result.newAmountPaid, 0);
  assert.equal(result.newCreditApplied, 0);
  assert.equal(result.newDueAmount, 0);
});

test("partial return reconciliation keeps tender, credit, and due balanced", () => {
  const sale = {
    total: 100,
    returnedAmount: 0,
    dueAmount: 50,
    amountPaid: 30,
    creditApplied: 20,
    payments: [{ method: "upi", amount: 30 }],
  };
  const first = computeReturnSettlement(sale, 75);
  assert.equal(first.dueReduction, 50);
  assert.equal(first.paidRefund, 25);
  assert.equal(first.creditRefund, 0);
  assert.equal(100 - first.newReturnedAmount, first.newAmountPaid + first.newCreditApplied + first.newDueAmount);

  const second = computeReturnSettlement({
    ...sale,
    returnedAmount: first.newReturnedAmount,
    amountPaid: first.newAmountPaid,
    creditApplied: first.newCreditApplied,
    dueAmount: first.newDueAmount,
    payments: first.newPayments,
  }, 25);
  assert.equal(second.paidRefund, 5);
  assert.equal(second.creditRefund, 20);
  assert.equal(second.newReturnedAmount, 100);
  assert.equal(second.newAmountPaid + second.newCreditApplied + second.newDueAmount, 0);
});

test("replacement credit cannot make actual payments exceed the replacement total", () => {
  assert.throws(
    () => computeReplacementCredit({ cashRefund: 0, replacementTotal: 100, extraPaid: 101 }),
    /cannot exceed/
  );
  assert.deepEqual(computeReplacementCredit({ cashRefund: 60, replacementTotal: 100, extraPaid: 40 }), {
    carriedCredit: 60,
    cashReturned: 0,
  });
});

test("payment splits accept retail and wholesale amounts but reject overpayment", () => {
  assert.deepEqual(normalizePaymentSplits([
    { method: "cash", amount: 25.5 },
    { method: "upi", amount: 74.5 },
  ], 100), [
    { method: "cash", amount: 25.5 },
    { method: "upi", amount: 74.5 },
  ]);
  assert.throws(
    () => normalizePaymentSplits([{ method: "cash", amount: 100.01 }], 100),
    /cannot exceed/
  );
  assert.throws(
    () => normalizePaymentSplits([{ method: "credit", amount: 50 }], 100),
    /Payment method/
  );
  assert.throws(
    () => normalizePaymentSplits([{ method: "cash", amount: 0 }], 100),
    /positive/
  );
});
