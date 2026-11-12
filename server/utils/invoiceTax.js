/**
 * GST summary for invoices (display-only).
 *
 * Selling prices are GST-inclusive. Each sale item may carry a `gstPct`
 * snapshot captured at sale time, so later product edits never change
 * historical invoices. The summary EXTRACTS the GST component that is already
 * included in the charged amounts: GST = inclusive × rate / (100 + rate).
 * It never adds tax on top of the sale total.
 *
 * Legacy sales without per-item gstPct snapshots produce no summary, so their
 * invoices are unchanged.
 *
 * CGST/SGST vs IGST split is intentionally not computed: the data model has no
 * place-of-supply information, so any split would be invented.
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function gstSummary(sale) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const rated = items.filter((item) => item && item.gstPct != null && num(item.gstPct) > 0);
  if (rated.length === 0) return null;

  const itemsSubtotal = items.reduce((sum, item) => sum + num(item && item.subtotal), 0);
  const billDiscount = Math.min(num(sale.billDiscountAmount), itemsSubtotal);

  // Allocate the bill discount proportionally so the per-rate inclusive
  // amounts always sum to the charged grand total.
  const groups = new Map();
  for (const item of items) {
    const rate = item && item.gstPct != null ? num(item.gstPct) : 0;
    const net = num(item && item.subtotal);
    const share = itemsSubtotal > 0 ? net - (billDiscount * net) / itemsSubtotal : net;
    groups.set(rate, (groups.get(rate) || 0) + share);
  }

  const rates = [];
  let totalTaxable = 0;
  let totalGst = 0;
  for (const rate of [...groups.keys()].sort((a, b) => a - b)) {
    const inclusive = round2(groups.get(rate));
    if (inclusive <= 0) continue;
    if (rate <= 0) {
      totalTaxable = round2(totalTaxable + inclusive);
      continue;
    }
    const gstAmount = round2((inclusive * rate) / (100 + rate));
    const taxable = round2(inclusive - gstAmount);
    rates.push({ rate, inclusive, taxable, gstAmount });
    totalTaxable = round2(totalTaxable + taxable);
    totalGst = round2(totalGst + gstAmount);
  }
  if (rates.length === 0) return null;
  return { rates, totalTaxable, totalGst };
}

module.exports = { gstSummary };
