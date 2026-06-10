/**
 * Sale math engine (Master Sprint — Discount Engine).
 *
 * Pure + deterministic so it is unit-testable and produces stable, stored
 * totals (historical invoices never change if logic later evolves).
 *
 * Supports item-level and bill-level discounts, each "percent" or "amount".
 * GST is intentionally NOT applied to the sale here (captured at product level).
 */

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
  if (type === "percent") return round2(clampNonNeg(Math.min(100, v)) * base / 100);
  return round2(Math.min(v, base)); // flat amount, never more than the base
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
    const gross = round2(unitPrice * quantity);
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
 * On returning goods worth `refund`:
 *   dueReduction = min(refund, dueAmount)   // cancels what was still owed
 *   cashRefund   = refund - dueReduction    // already-paid portion goes back as cash
 * Reduces payments[] (greedy) + amountPaid by cashRefund so "collected" drops.
 * Invariant after applying: total - returnedAmount === amountPaid + dueAmount.
 */
function computeReturnSettlement(sale, refund) {
  const r = round2(refund);
  const dueReduction = round2(Math.min(r, Math.max(0, sale.dueAmount || 0)));
  const cashRefund = round2(r - dueReduction);
  const newReturnedAmount = round2((sale.returnedAmount || 0) + r);

  const newPayments = (sale.payments || []).map((p) => ({ method: p.method, amount: p.amount }));
  let remaining = cashRefund;
  for (const p of newPayments) {
    if (remaining <= 0) break;
    const take = Math.min(p.amount, remaining);
    p.amount = round2(p.amount - take);
    remaining = round2(remaining - take);
  }
  const trimmedPayments = newPayments.filter((p) => p.amount > 0);

  const newAmountPaid = round2(Math.max(0, (sale.amountPaid || 0) - cashRefund));
  const newDueAmount = round2(Math.max(0, (sale.total || 0) - newReturnedAmount - newAmountPaid));
  const paymentStatus = newDueAmount === 0 ? (newAmountPaid > 0 ? "paid" : "unpaid") : newAmountPaid > 0 ? "partial" : "unpaid";

  return { dueReduction, cashRefund, newReturnedAmount, newPayments: trimmedPayments, newAmountPaid, newDueAmount, paymentStatus };
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
  const carriedCredit = round2(Math.min(refund, Math.max(0, repl - extra)));
  const cashReturned = round2(refund - carriedCredit);
  return { carriedCredit, cashReturned };
}

module.exports = { computeSaleTotals, discountAmountFor, computeReturnSettlement, computeReplacementCredit, round2 };
