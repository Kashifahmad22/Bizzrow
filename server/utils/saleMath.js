/**
 * Sale math engine (Master Sprint — Discount Engine).
 *
 * Pure + deterministic so it is unit-testable and produces stable, stored
 * totals (historical invoices never change if logic later evolves).
 *
 * Supports item-level and bill-level discounts, each "percent" or "amount".
 * GST is intentionally NOT applied to the sale here (captured at product level).
 */

const quantityMath = require("./quantity");
const { multiplyRounded } = require("./money");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clampNonNeg(n) {
  return n < 0 ? 0 : n;
}

// Resolve a discount spec against a base amount -> the discount value in ₹.
function discountAmountFor(base, type, value) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  if (type === "percent") return multiplyRounded(clampNonNeg(Math.min(100, v)), base, 100);
  return round2(Math.min(v, base)); // flat amount, never more than the base
}

function allocateCents(total, weights) {
  const totalCents = Math.max(0, Math.round(Number(total || 0) * 100));
  const cents = weights.map((weight) => Math.max(0, Math.round(Number(weight || 0) * 100)));
  const weightTotal = cents.reduce((sum, value) => sum + value, 0);
  if (!totalCents || !weightTotal) return cents.map(() => 0);

  const exact = cents.map((value) => (totalCents * value) / weightTotal);
  const allocated = exact.map(Math.floor);
  let remainder = totalCents - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i += 1) allocated[order[i].index] += 1;
  return allocated;
}

function allocateReturnItems(sale, requestedItems) {
  const items = sale.items || [];
  const itemWeights = items.map((item) => {
    if (item.subtotal != null) return Number(item.subtotal) || 0;
    return multiplyRounded(Number(item.unitPrice) || 0, Number(item.quantity) || 0);
  });
  const lineCents = allocateCents(sale.total, itemWeights);
  const remainingByProduct = new Map();
  for (const item of items) {
    const id = String(item.product);
    const available = Math.max(0, quantityMath.subtract(Number(item.quantity || 0), Number(item.returnedQty || 0)));
    remainingByProduct.set(id, quantityMath.add(remainingByProduct.get(id) || 0, available));
  }

  const requestedByProduct = new Map();
  for (const request of requestedItems || []) {
    const quantity = quantityMath.exactQuantity(request.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Return quantities must be positive numbers");
    }
    const id = String(request.productId);
    const historicalScale = items.filter((item) => String(item.product) === id
      && Number(item.returnedQty || 0) < Number(item.quantity))
      .reduce((scale, item) => Math.max(scale, quantityMath.parts(item.quantity).scale,
        quantityMath.parts(item.returnedQty || 0).scale), 3);
    if (quantityMath.parts(request.quantity).inputScale > historicalScale) {
      throw new Error("Return quantities must have at most three decimal places unless returning a historical fractional sale");
    }
    requestedByProduct.set(id, quantityMath.add(requestedByProduct.get(id) || 0, quantity));
  }

  for (const [id, quantity] of requestedByProduct) {
    if (!remainingByProduct.has(id)) throw new Error("Returned item is not part of this sale");
    if (quantity > remainingByProduct.get(id)) {
      throw new Error(`Cannot return ${quantity} — only ${remainingByProduct.get(id)} returnable`);
    }
  }

  const result = [];
  for (const [id, requested] of requestedByProduct) {
    let remaining = requested;
    for (const [index, item] of items.entries()) {
      if (String(item.product) !== id || remaining === 0) continue;
      const oldReturned = Number(item.returnedQty) || 0;
      const available = Math.max(0, quantityMath.subtract(Number(item.quantity || 0), oldReturned));
      const quantity = Math.min(available, remaining);
      if (quantity === 0) continue;
      if (quantityMath.parts(quantity).scale > Math.max(3, quantityMath.parts(item.quantity).scale,
        quantityMath.parts(oldReturned).scale)) {
        throw new Error("Return quantity exceeds the historical precision of this sale line");
      }
      const totalLineCents = lineCents[index];
      const beforeCents = quantityMath.proportionalCents(totalLineCents, oldReturned, item.quantity);
      const afterCents = quantityMath.proportionalCents(totalLineCents, quantityMath.add(oldReturned, quantity), item.quantity);
      result.push({
        item,
        quantity,
        refund: (afterCents - beforeCents) / 100,
        newReturnedQty: quantityMath.add(oldReturned, quantity),
      });
      remaining = quantityMath.subtract(remaining, quantity);
    }
  }

  return result;
}

function normalizePaymentSplits(payments, maximum) {
  if (!Array.isArray(payments)) throw new Error("Payments must be an array");
  const normalized = [];
  for (const payment of payments) {
    if (!payment || !["cash", "upi", "bank", "card"].includes(payment.method)) {
      throw new Error("Payment method must be cash, upi, bank, or card");
    }
    const amount = paymentPaise(payment.amount) / 100;
    if (amount <= 0) throw new Error("Each payment amount must be positive and at least 0.01");
    normalized.push({ method: payment.method, amount });
  }
  const total = round2(normalized.reduce((sum, payment) => sum + payment.amount, 0));
  if (total > round2(maximum)) throw new Error("Payments cannot exceed the amount due");
  return normalized;
}

function paymentPaise(value) {
  if ((typeof value !== "string" && typeof value !== "number")
      || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    throw new Error("Payment amounts must be non-negative with at most two decimal places");
  }
  const [whole, fraction = ""] = String(value).split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new Error("Payment amount is too large");
  return paise;
}

function validateExpectedTotal(body, total) {
  if (!Object.prototype.hasOwnProperty.call(body, "expectedTotal")) return;
  let expected;
  try {
    expected = paymentPaise(body.expectedTotal);
  } catch (error) {
    error.status = 400;
    throw error;
  }
  if (expected !== paymentPaise(total)) {
    const error = new Error("Prices or invoice totals changed. Discard the pending sale, close and reopen checkout to refresh prices, and review the invoice before retrying.");
    error.status = 409;
    throw error;
  }
}

function validateReviewedItems(body, items, { checkPrices = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, "reviewedItems")) return;
  const conflict = () => {
    const error = new Error("Cart items or prices changed. Discard the pending sale, close and reopen checkout to refresh prices, and review the updated cart before retrying.");
    error.status = 409;
    return error;
  };
  if (!Array.isArray(body.reviewedItems) || body.reviewedItems.length !== items.length) throw conflict();
  const expected = new Map();
  for (const line of body.reviewedItems) {
    if (!line || typeof line.productId !== "string" || !/^[0-9a-f]{24}$/i.test(line.productId)
        || typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw conflict();
    }
    const id = line.productId.toLowerCase();
    if (expected.has(id)) throw conflict();
    let price;
    try {
      price = paymentPaise(line.unitPrice);
    } catch (error) {
      throw conflict();
    }
    expected.set(id, { quantity: line.quantity, price });
  }
  for (const item of items) {
    const id = String(item.product).toLowerCase();
    const line = expected.get(id);
    if (!line || line.quantity !== item.quantity
        || (checkPrices && line.price !== paymentPaise(item.unitPrice))) throw conflict();
    expected.delete(id);
  }
  if (expected.size) throw conflict();
}

function normalizeCheckoutPayments(body, maximum) {
  const hasTender = Object.prototype.hasOwnProperty.call(body, "cashTendered");
  if (Object.prototype.hasOwnProperty.call(body, "cashChange")) {
    throw new Error("Change is calculated by the server");
  }
  if (hasTender && (Object.prototype.hasOwnProperty.call(body, "amountPaid")
      || Object.prototype.hasOwnProperty.call(body, "paymentMethod"))) {
    throw new Error("Cash tender cannot be combined with legacy payment fields");
  }
  if ((hasTender && Object.prototype.hasOwnProperty.call(body, "payments") && !Array.isArray(body.payments))
      || (body.payments != null && !Array.isArray(body.payments))) {
    throw new Error("Payments must be an array");
  }
  const requested = body.payments != null
    ? body.payments
    : body.amountPaid != null && Number(body.amountPaid) !== 0
      ? [{ method: body.paymentMethod || "cash", amount: body.amountPaid }]
      : [];
  if (body.amountPaid != null) paymentPaise(body.amountPaid);
  for (const payment of requested) {
    if (!payment || !["cash", "upi", "bank", "card"].includes(payment.method)) {
      throw new Error("Payment method must be cash, upi, bank, or card");
    }
    if (paymentPaise(payment.amount) <= 0) throw new Error("Each payment amount must be positive");
    if (hasTender && payment.method === "cash") {
      throw new Error("Cash splits cannot be combined with cash tender");
    }
  }
  const totalPaise = paymentPaise(maximum);
  let paidPaise = 0;
  for (const payment of requested) {
    paidPaise += paymentPaise(payment.amount);
    if (!Number.isSafeInteger(paidPaise)) throw new Error("Payment amount is too large");
  }
  if (paidPaise > totalPaise) throw new Error("Payments cannot exceed the amount due");
  const payments = requested.map(({ method, amount }) => ({ method, amount: paymentPaise(amount) / 100 }));
  let snapshot = {};
  if (hasTender) {
    const tenderPaise = paymentPaise(body.cashTendered);
    if (totalPaise === 0 && tenderPaise > 0) throw new Error("Cash tender is not allowed for a zero-value sale");
    const cashPaise = Math.min(tenderPaise, totalPaise - paidPaise);
    if (cashPaise > 0) payments.unshift({ method: "cash", amount: cashPaise / 100 });
    paidPaise += cashPaise;
    snapshot = { cashTendered: tenderPaise / 100, cashChange: (tenderPaise - cashPaise) / 100 };
  }
  const summaryMethod = payments.length > 1 ? "split" : payments.length ? payments[0].method : "cash";
  return { payments, amountPaid: paidPaise / 100, dueAmount: (totalPaise - paidPaise) / 100, summaryMethod, ...snapshot };
}

/**
 * computeSaleTotals({ items, billDiscount })
 *  items: [{ unitPrice, quantity, discountType?, discountValue? , ...snapshot }]
 *  billDiscount: { type: "percent"|"amount", value: Number }
 *
 * Returns normalized items (with gross, discountAmount, subtotal=net) plus
 * sale-level rollups. Backward compatible: items without discount => 0.
 */
function computeSaleTotals({ items = [], billDiscount = {} } = {}) {
  let itemsGross = 0;
  let itemDiscountTotal = 0;

  const normItems = items.map((it) => {
    const unitPrice = round2(it.unitPrice);
    const quantity = Number(it.quantity) || 0;
    const gross = multiplyRounded(unitPrice, quantity);
    const discountType = it.discountType === "percent" ? "percent" : "amount";
    const discountValue = Number(it.discountValue) || 0;
    const discountAmount = discountAmountFor(gross, discountType, discountValue);
    const subtotal = round2(clampNonNeg(gross - discountAmount));
    itemsGross = round2(itemsGross + gross);
    itemDiscountTotal = round2(itemDiscountTotal + discountAmount);
    return { ...it, unitPrice, quantity, gross, discountType, discountValue, discountAmount, subtotal };
  });

  const subtotal = round2(clampNonNeg(itemsGross - itemDiscountTotal));
  const billDiscountType = billDiscount?.type === "percent" ? "percent" : "amount";
  const billDiscountValue = Number(billDiscount?.value) || 0;
  const billDiscountAmount = discountAmountFor(subtotal, billDiscountType, billDiscountValue);
  const total = round2(clampNonNeg(subtotal - billDiscountAmount));
  const totalDiscount = round2(itemDiscountTotal + billDiscountAmount);

  return {
    items: normItems,
    itemsGross,
    itemDiscountTotal,
    subtotal,
    billDiscountType,
    billDiscountValue,
    billDiscountAmount,
    totalDiscount,
    total,
  };
}

/**
 * computeReturnSettlement(sale, refund) — pure money math for a return/replacement leg.
 *
 * The outstanding part is cancelled first, followed by actual tender and then
 * replacement credit. The compatibility cashRefund result is the post-due value;
 * paidRefund and creditRefund separate its two accounting sources.
 * Invariant after applying: total - returnedAmount === amountPaid + creditApplied + dueAmount.
 */
function computeReturnSettlement(sale, refund) {
  const r = round2(refund);
  const remaining = round2((sale.total || 0) - (sale.returnedAmount || 0));
  if (!Number.isFinite(r) || r < 0 || r > remaining) {
    throw new Error("Return amount exceeds the remaining sale value");
  }
  const dueReduction = round2(Math.min(r, Math.max(0, sale.dueAmount || 0)));
  const afterDue = round2(r - dueReduction);
  const paymentSplits = sale.payments || [];
  const legacyCredit = round2((paymentSplits
    .filter((payment) => payment.method === "credit")
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
    || (paymentSplits.length === 0 && sale.paymentMethod === "credit" ? Number(sale.amountPaid) || 0 : 0)));
  const creditApplied = round2(Math.max(Number(sale.creditApplied) || 0, legacyCredit));
  const rawActualPayments = paymentSplits.length
    ? paymentSplits.filter((payment) => payment.method !== "credit")
    : (Number(sale.amountPaid) || 0) > legacyCredit
      ? [{
        method: ["cash", "upi", "bank", "card"].includes(sale.paymentMethod) ? sale.paymentMethod : "cash",
        amount: round2((Number(sale.amountPaid) || 0) - legacyCredit),
      }]
      : [];
  const actualPaymentTotal = round2(rawActualPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
  const amountPaid = round2(Math.min(
    Math.max(0, (Number(sale.amountPaid) || 0) - legacyCredit),
    actualPaymentTotal
  ));
  const reconciledDue = round2(remaining - amountPaid - creditApplied);
  if (Math.abs(reconciledDue - round2(sale.dueAmount || 0)) > 0.001) {
    throw new Error("Sale's paid, credited, and due amounts are inconsistent");
  }
  let tenderToRetain = amountPaid;
  const actualPayments = [];
  for (const payment of rawActualPayments) {
    if (tenderToRetain <= 0) break;
    const amount = round2(Math.min(Number(payment.amount) || 0, tenderToRetain));
    if (amount > 0) {
      actualPayments.push({
        method: payment.method,
        amount,
        source: payment.source || "sale",
        ...(payment.collectedAt ? { collectedAt: payment.collectedAt } : {}),
      });
    }
    tenderToRetain = round2(tenderToRetain - amount);
  }
  const paidRefund = round2(Math.min(afterDue, amountPaid));
  const creditRefund = round2(afterDue - paidRefund);
  if (creditRefund > creditApplied) {
    throw new Error("Return amount exceeds the sale's paid and credited balance");
  }
  const newReturnedAmount = round2((sale.returnedAmount || 0) + r);

  const newPayments = actualPayments.map((payment) => ({ ...payment }));
  const paidRefundPayments = [];
  let remainingCashRefund = paidRefund;
  for (const p of newPayments) {
    if (remainingCashRefund <= 0) break;
    const take = Math.min(p.amount, remainingCashRefund);
    p.amount = round2(p.amount - take);
    remainingCashRefund = round2(remainingCashRefund - take);
    if (take > 0) {
      paidRefundPayments.push({
        method: p.method,
        amount: round2(take),
        source: p.source || "sale",
      });
    }
  }
  const trimmedPayments = newPayments.filter((p) => p.amount > 0);

  const newAmountPaid = round2(Math.max(0, amountPaid - paidRefund));
  const newCreditApplied = round2(Math.max(0, creditApplied - creditRefund));
  const calculatedDue = round2((sale.total || 0) - newReturnedAmount - newAmountPaid - newCreditApplied);
  if (calculatedDue < 0) throw new Error("Return would overpay the remaining sale value");
  const newDueAmount = calculatedDue;
  const paymentStatus = newDueAmount === 0
    ? "paid"
    : newAmountPaid + newCreditApplied > 0 ? "partial" : "unpaid";

  return {
    dueReduction,
    cashRefund: afterDue,
    paidRefund,
    creditRefund,
    paidRefundPayments,
    newReturnedAmount,
    newPayments: trimmedPayments,
    newAmountPaid,
    newCreditApplied,
    newDueAmount,
    paymentStatus,
  };
}

/**
 * computeReplacementCredit({ cashRefund, replacementTotal, extraPaid }) — money carry-over for a replacement.
 *
 * A replacement is a cash-neutral swap. The cash the customer had ALREADY paid on the
 * returned goods (cashRefund, surfaced by computeReturnSettlement) is carried as a
 * credit toward the replacement instead of being physically handed back. The customer
 * only settles a positive difference (extraPaid); any leftover credit on a lower-value
 * swap is the genuine cash returned.
 *
 *   carriedCredit = min(cashRefund, max(0, replacementTotal - extraPaid))  // applied to the new sale
 *   cashReturned  = cashRefund - carriedCredit                            // real cash back (lower swap)
 *
 * Guarantees the customer never wrongly shows as owing the carried value: on an even
 * swap the new sale ends fully paid (due 0); on a higher swap they owe nothing once the
 * difference is paid; on a lower swap the excess credit is refunded as cash.
 */
function computeReplacementCredit({ cashRefund = 0, replacementTotal = 0, extraPaid = 0 } = {}) {
  const refund = round2(Math.max(0, cashRefund));
  const repl = round2(Math.max(0, replacementTotal));
  const extra = round2(Math.max(0, extraPaid));
  if (extra > repl) throw new Error("Payments cannot exceed the replacement total");
  const carriedCredit = round2(Math.min(refund, repl - extra));
  const cashReturned = round2(refund - carriedCredit);
  return { carriedCredit, cashReturned };
}

module.exports = {
  computeSaleTotals,
  discountAmountFor,
  allocateCents,
  allocateReturnItems,
  normalizePaymentSplits,
  normalizeCheckoutPayments,
  paymentPaise,
  validateExpectedTotal,
  validateReviewedItems,
  computeReturnSettlement,
  computeReplacementCredit,
  round2,
};
