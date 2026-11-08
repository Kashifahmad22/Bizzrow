const { round2 } = require("../utils/saleMath");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getActualSalePayments(sale) {
  const splits = sale.payments || [];
  const legacyCredit = round2(splits
    .filter((payment) => payment.method === "credit")
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
  const rawActual = splits.filter((payment) => payment.method !== "credit");
  const rawTotal = round2(rawActual.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
  const recordedTender = round2(Math.max(0, (Number(sale.amountPaid) || 0) - legacyCredit));
  const actualPaid = splits.length ? Math.min(recordedTender, rawTotal) : recordedTender;
  const payments = [];
  let remaining = actualPaid;
  for (const payment of rawActual) {
    if (remaining <= 0) break;
    const amount = round2(Math.min(Number(payment.amount) || 0, remaining));
    if (amount > 0) {
      payments.push({
        method: payment.method,
        amount,
        source: payment.source || "sale",
        ...(payment.collectedAt ? { collectedAt: payment.collectedAt } : {}),
      });
      remaining = round2(remaining - amount);
    }
  }
  if (actualPaid > 0 && payments.length === 0) {
    const method = ["cash", "upi", "bank", "card"].includes(sale.paymentMethod)
      ? sale.paymentMethod
      : "cash";
    payments.push({ method, amount: actualPaid, source: "sale" });
  }
  return {
    payments,
    actualPaid,
    creditApplied: round2(Math.max(Number(sale.creditApplied) || 0, legacyCredit)),
  };
}

function allocateLedgerPayment(sales, amount, paymentMethod, collectedAt = new Date()) {
  let remaining = round2(amount);
  const allocatedSales = [];
  for (const sale of sales) {
    if (remaining <= 0) break;
    const due = round2(sale.dueAmount || 0);
    if (due <= 0) continue;
    const allocation = round2(Math.min(remaining, due));
    const current = getActualSalePayments(sale);
    const saleValueRemaining = round2((sale.total || 0) - (sale.returnedAmount || 0));
    const reconciledDue = round2(saleValueRemaining - current.actualPaid - current.creditApplied);
    if (Math.abs(reconciledDue - due) > 0.001) {
      throw httpError(409, `Sale ${sale.invoiceNumber} has an unreconciled balance`);
    }
    sale.payments = [
      ...current.payments,
      { method: paymentMethod, amount: allocation, source: "ledger", collectedAt },
    ];
    sale.amountPaid = round2(current.actualPaid + allocation);
    sale.creditApplied = current.creditApplied;
    sale.dueAmount = round2(saleValueRemaining - sale.amountPaid - sale.creditApplied);
    if (sale.dueAmount < 0) {
      throw httpError(409, `Payment would overpay sale ${sale.invoiceNumber}`);
    }
    const methods = new Set(sale.payments.map((payment) => payment.method));
    sale.paymentMethod = sale.creditApplied > 0
      ? methods.size > 0 ? "split" : "credit"
      : methods.size > 1 ? "split"
        : methods.size === 1 ? sale.payments[0].method : "cash";
    sale.paymentStatus = sale.dueAmount === 0 ? "paid" : "partial";
    allocatedSales.push(sale);
    remaining = round2(remaining - allocation);
  }
  if (remaining > 0) {
    throw httpError(409, "Customer balance cannot be allocated to outstanding sales");
  }
  return allocatedSales;
}

module.exports = { allocateLedgerPayment };
