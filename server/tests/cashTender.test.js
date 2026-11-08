const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const { allocateLedgerPayment } = require("../services/paymentAllocation");
const { normalizeCheckoutPayments, computeReturnSettlement, validateExpectedTotal } = require("../utils/saleMath");

test("expected checkout totals are optional, exact to paise, and never substituted", () => {
  assert.doesNotThrow(() => validateExpectedTotal({}, 282));
  assert.doesNotThrow(() => validateExpectedTotal({ expectedTotal: "282.00" }, 282));
  assert.doesNotThrow(() => validateExpectedTotal({ expectedTotal: 0.3 }, 0.3));
  assert.throws(() => validateExpectedTotal({ expectedTotal: 282 }, 290),
    (error) => error.status === 409 && /reopen checkout/.test(error.message));
  for (const expectedTotal of [null, -1, "1.001", Infinity, "", true]) {
    assert.throws(() => validateExpectedTotal({ expectedTotal }, 282), (error) => error.status === 400);
  }
});

test("checkout applies cash tender after non-cash payments in paise", () => {
  for (const [tender, payments, expected] of [
    [282, [], [282, 0, 282, 0]],
    [300, [], [282, 18, 282, 0]],
    [250, [], [250, 0, 250, 32]],
    [200, [{ method: "upi", amount: 82 }], [200, 0, 282, 0]],
    [300, [{ method: "upi", amount: 10 }], [272, 28, 282, 0]],
  ]) {
    const result = normalizeCheckoutPayments({ cashTendered: tender, payments }, 282);
    assert.deepEqual([result.payments[0].amount, result.cashChange, result.amountPaid, result.dueAmount], expected);
    assert.equal(result.cashTendered, tender);
  }
  const paise = normalizeCheckoutPayments({ cashTendered: "0.30", payments: [{ method: "card", amount: "0.01" }] }, 0.3);
  assert.deepEqual(paise.payments, [{ method: "cash", amount: 0.29 }, { method: "card", amount: 0.01 }]);
  assert.equal(paise.cashChange, 0.01);
  assert.equal(paise.amountPaid, 0.3);
});

test("checkout rejects invalid tender, precision, conflicts and non-cash overpayment", () => {
  for (const value of [-1, "1.001", Infinity, NaN, true, "", null, "1e2", "90071992547410"]) {
    assert.throws(() => normalizeCheckoutPayments({ cashTendered: value, payments: [] }, 282));
  }
  for (const body of [
    { cashTendered: 1, payments: [{ method: "upi", amount: 282.01 }] },
    { cashTendered: 1, payments: [{ method: "cash", amount: 1 }] },
    { cashTendered: 1, amountPaid: 1 },
    { cashTendered: 1, amountPaid: null },
    { cashTendered: 1, paymentMethod: "cash" },
    { cashTendered: 1, cashChange: 0 },
    { cashTendered: 1, payments: [{ method: "card", amount: 0.001 }] },
    { payments: [{ method: "cash", amount: 1.001 }] },
    { cashTendered: 1, payments: "invalid" },
    { cashTendered: 1, payments: null },
  ]) assert.throws(() => normalizeCheckoutPayments(body, 282));
  assert.throws(() => normalizeCheckoutPayments({ cashTendered: 0.01 }, 0), /zero-value/);
  assert.equal(normalizeCheckoutPayments({ cashTendered: 0 }, 0).dueAmount, 0);
});

test("legacy payment inputs remain net collections with no fabricated snapshot", () => {
  for (const body of [
    { amountPaid: 50, paymentMethod: "cash" },
    { payments: [{ method: "cash", amount: 50 }] },
  ]) {
    const result = normalizeCheckoutPayments(body, 100);
    assert.deepEqual(result.payments, [{ method: "cash", amount: 50 }]);
    assert.equal(result.amountPaid, 50);
    assert.equal(result.dueAmount, 50);
    assert.equal(Object.hasOwn(result, "cashTendered"), false);
  }
  const sale = new Sale({ owner: new mongoose.Types.ObjectId(), customerName: "Legacy", total: 50 });
  assert.equal(sale.toObject().cashTendered, undefined);
  assert.equal(sale.toObject().cashChange, undefined);
});

test("returns use applied cash rather than original tender and snapshot fields are immutable", () => {
  const sale = new Sale({
    owner: new mongoose.Types.ObjectId(), customerName: "Customer", total: 282,
    cashTendered: 300, cashChange: 18, amountPaid: 282, dueAmount: 0,
    payments: [{ method: "cash", amount: 282 }],
  });
  const partial = computeReturnSettlement(sale, 100);
  assert.equal(partial.paidRefund, 100);
  assert.equal(partial.newAmountPaid, 182);
  const full = computeReturnSettlement(sale, 282);
  assert.equal(full.paidRefund, 282);
  assert.equal(full.newAmountPaid, 0);
  sale.$isNew = false;
  sale.cashTendered = 500;
  sale.cashChange = 218;
  assert.equal(sale.cashTendered, 300);
  assert.equal(sale.cashChange, 18);
});

test("later ledger payments leave the original checkout tender and collection snapshot unchanged", () => {
  const sale = new Sale({
    owner: new mongoose.Types.ObjectId(), customerName: "Customer", total: 282,
    cashTendered: 250, cashChange: 0, amountPaid: 250, dueAmount: 32,
    payments: [{ method: "cash", amount: 250, source: "sale" }],
    collectionPayments: [{ method: "cash", amount: 250, source: "sale" }],
  });
  allocateLedgerPayment([sale], 32, "upi");
  assert.equal(sale.cashTendered, 250);
  assert.equal(sale.cashChange, 0);
  assert.equal(sale.collectionPayments[0].amount, 250);
  assert.equal(sale.payments[1].amount, 32);
  assert.equal(sale.payments[1].source, "ledger");
  assert.equal(sale.amountPaid, 282);
  assert.equal(sale.dueAmount, 0);
});
