const test = require("node:test");
const assert = require("node:assert");
const { allocateLedgerPayment } = require("../services/paymentAllocation");

test("ledger payments allocate oldest outstanding sales and record tender splits", () => {
  const firstSale = {
    invoiceNumber: "BZR-1",
    total: 100,
    returnedAmount: 0,
    amountPaid: 40,
    creditApplied: 0,
    dueAmount: 60,
    payments: [{ method: "cash", amount: 40, source: "sale" }],
  };
  const secondSale = {
    invoiceNumber: "BZR-2",
    total: 100,
    returnedAmount: 0,
    amountPaid: 30,
    creditApplied: 20,
    dueAmount: 50,
    payments: [{ method: "upi", amount: 30, source: "sale" }],
  };
  const collectedAt = new Date("2025-01-01T00:00:00.000Z");
  const updated = allocateLedgerPayment([firstSale, secondSale], 80, "bank", collectedAt);

  assert.equal(updated.length, 2);
  assert.equal(firstSale.dueAmount, 0);
  assert.equal(firstSale.amountPaid, 100);
  assert.deepEqual(firstSale.payments.map((payment) => payment.amount), [40, 60]);
  assert.equal(firstSale.payments[1].source, "ledger");
  assert.equal(firstSale.payments[1].collectedAt, collectedAt);
  assert.equal(secondSale.dueAmount, 30);
  assert.equal(secondSale.amountPaid, 50);
  assert.equal(secondSale.creditApplied, 20);
  assert.equal(secondSale.payments[1].amount, 20);
});

test("legacy replacement credit is separated from collected payments on reconciliation", () => {
  const sale = {
    invoiceNumber: "legacy",
    total: 100,
    returnedAmount: 0,
    amountPaid: 50,
    dueAmount: 50,
    creditApplied: 0,
    payments: [
      { method: "cash", amount: 30 },
      { method: "credit", amount: 20 },
    ],
  };
  allocateLedgerPayment([sale], 50, "cash");
  assert.equal(sale.amountPaid, 80);
  assert.equal(sale.creditApplied, 20);
  assert.equal(sale.dueAmount, 0);
  assert.equal(sale.payments.reduce((sum, payment) => sum + payment.amount, 0), sale.amountPaid);
  assert.equal(sale.payments.some((payment) => payment.method === "credit"), false);
});

test("ledger payment allocations reject inconsistent and excessive balances", () => {
  assert.throws(
    () => allocateLedgerPayment([{
      invoiceNumber: "inconsistent",
      total: 100,
      amountPaid: 40,
      dueAmount: 50,
      payments: [{ method: "cash", amount: 40 }],
    }], 10, "cash"),
    (error) => error.status === 409 && /unreconciled/.test(error.message)
  );
  assert.throws(
    () => allocateLedgerPayment([{
      invoiceNumber: "limited",
      total: 100,
      amountPaid: 50,
      dueAmount: 50,
      payments: [{ method: "cash", amount: 50 }],
    }], 60, "cash"),
    (error) => error.status === 409 && /cannot be allocated/.test(error.message)
  );
});
