const test = require("node:test");
const assert = require("node:assert");
const { computeReplacementCredit } = require("../utils/saleMath");

// A replacement is a CASH-NEUTRAL swap. The already-paid value on the returned goods
// (cashRefund) is carried as credit toward the new sale so the customer never wrongly
// shows as owing the carried amount. These cover Phase 7: same / higher / lower value.

// Same value, original fully paid: full credit carries, nothing owed, no cash back.
test("even swap carries full credit (fully paid)", () => {
  const { carriedCredit, cashReturned } = computeReplacementCredit({ cashRefund: 1000, replacementTotal: 1000, extraPaid: 0 });
  assert.equal(carriedCredit, 1000); // new sale ends fully paid -> due 0
  assert.equal(cashReturned, 0);
});

// Higher value, original fully paid: customer pays the ₹500 difference, full credit carries.
test("higher swap carries credit, customer pays difference", () => {
  const { carriedCredit, cashReturned } = computeReplacementCredit({ cashRefund: 1000, replacementTotal: 1500, extraPaid: 500 });
  assert.equal(carriedCredit, 1000); // 1000 credit + 500 cash = 1500 paid -> due 0
  assert.equal(cashReturned, 0);
});

// Lower value, original fully paid: only ₹700 of credit is needed, ₹300 returned as cash.
test("lower swap refunds the excess credit as cash", () => {
  const { carriedCredit, cashReturned } = computeReplacementCredit({ cashRefund: 1000, replacementTotal: 700, extraPaid: 0 });
  assert.equal(carriedCredit, 700); // new sale fully paid -> due 0
  assert.equal(cashReturned, 300); // genuine cash back to customer
});

// Partially-paid original (paid 400 / due 600), even swap: only the PAID portion carries.
// The due portion was cancelled by the return, so the customer keeps the same ₹600 balance.
test("partially paid even swap carries only the paid portion", () => {
  const { carriedCredit, cashReturned } = computeReplacementCredit({ cashRefund: 400, replacementTotal: 1000, extraPaid: 0 });
  assert.equal(carriedCredit, 400); // new sale: paid 400, due 600 (same balance as before)
  assert.equal(cashReturned, 0);
});

// No prior cash (e.g. fully-unpaid original): nothing to carry, nothing to refund.
test("no cash paid means no credit carried", () => {
  const { carriedCredit, cashReturned } = computeReplacementCredit({ cashRefund: 0, replacementTotal: 800, extraPaid: 0 });
  assert.equal(carriedCredit, 0);
  assert.equal(cashReturned, 0);
});
