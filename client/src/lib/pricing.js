// Shared client-side pricing helpers. Display/UX only — the backend
// (server/utils/productPricing.js) remains the source of financial truth.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Official default: retail = 2x the GST-inclusive wholesale price.
export const defaultRetailPrice = (wholesale) => Math.round((Number(wholesale) || 0) * 200) / 100;

// Selling prices are GST-inclusive. GST = inclusive x rate / (100 + rate).
export function gstBreakdown(inclusiveAmount, gstPct) {
  const amount = Number(inclusiveAmount);
  const rate = Number(gstPct);
  const rounded = Number.isFinite(amount) && amount > 0 ? round2(amount) : 0;
  if (!rounded || !Number.isFinite(rate) || rate <= 0) {
    return { gstPct: 0, gstAmount: 0, taxableValue: rounded };
  }
  const gstAmount = round2((rounded * rate) / (100 + rate));
  return { gstPct: rate, gstAmount, taxableValue: round2(rounded - gstAmount) };
}
