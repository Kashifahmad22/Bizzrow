const test = require("node:test");
const assert = require("node:assert");
const { computeReturnSettlement } = require("../utils/saleMath");

// Walk-in / fully paid: returning ₹500 on a ₹1000 fully-paid sale refunds cash
// and DROPS collected to ₹500 (the Phase 2 bug fix).
test("fully paid return reduces collected by cash refund", () => {
  const sale = { total: 1000, amountPaid: 1000, dueAmount: 0, returnedAmount: 0, payments: [{ method: "cash", amount: 1000 }] };
  const s = computeReturnSettlement(sale, 500);
  assert.equal(s.dueReduction, 0);
  assert.equal(s.cashRefund, 500);
  assert.equal(s.newAmountPaid, 500); // collected dropped
  assert.equal(s.newDueAmount, 0);
  assert.equal(s.newReturnedAmount, 500);
  assert.equal(s.newPayments[0].amount, 500);
  // invariant: total - returned == paid + due
  assert.equal(1000 - s.newReturnedAmount, s.newAmountPaid + s.newDueAmount);
});

// Partly paid: return first cancels the outstanding due (no cash out), collected unchanged.
test("partly paid return cancels due first", () => {
  const sale = { total: 1000, amountPaid: 400, dueAmount: 600, returnedAmount: 0, payments: [{ method: "upi", amount: 400 }] };
  const s = computeReturnSettlement(sale, 500);
  assert.equal(s.dueReduction, 500);
  assert.equal(s.cashRefund, 0);
  assert.equal(s.newAmountPaid, 400); // collected unchanged
  assert.equal(s.newDueAmount, 100); // 1000 - 500 - 400
  assert.equal(1000 - s.newReturnedAmount, s.newAmountPaid + s.newDueAmount);
});

// Full return of a fully paid sale: everything comes back.
test("full return refunds everything", () => {
  const sale = { total: 1000, amountPaid: 1000, dueAmount: 0, returnedAmount: 0, payments: [{ method: "cash", amount: 600 }, { method: "upi", amount: 400 }] };
  const s = computeReturnSettlement(sale, 1000);
  assert.equal(s.cashRefund, 1000);
  assert.equal(s.newAmountPaid, 0);
  assert.equal(s.newReturnedAmount, 1000);
  assert.equal(s.newPayments.length, 0);
  assert.equal(s.newDueAmount, 0);
});

// Mixed: paid 700 (due 300), return 500 -> cancel 300 due + refund 200 cash.
test("return splits between due cancel and cash refund", () => {
  const sale = { total: 1000, amountPaid: 700, dueAmount: 300, returnedAmount: 0, payments: [{ method: "cash", amount: 700 }] };
  const s = computeReturnSettlement(sale, 500);
  assert.equal(s.dueReduction, 300);
  assert.equal(s.cashRefund, 200);
  assert.equal(s.newAmountPaid, 500); // 700 - 200
  assert.equal(s.newDueAmount, 0); // 1000 - 500 - 500
  assert.equal(1000 - s.newReturnedAmount, s.newAmountPaid + s.newDueAmount);
});
