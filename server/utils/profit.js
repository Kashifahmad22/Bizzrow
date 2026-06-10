/**
 * Profit engine (Final Sprint — Phase C).
 *
 * Profit is realized margin AFTER discounts and returns:
 *   netRevenue = sale.total - returnedAmount
 *   COGS       = Σ (quantity - returnedQty) * unitCost
 *   profit     = netRevenue - COGS
 *
 * unitCost prefers the cost snapshot stored on the sale item; for legacy sales
 * (no snapshot) it falls back to the current product cost via costMap.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function unitCostFor(item, costMap = {}) {
  if (item.costPrice && item.costPrice > 0) return item.costPrice;
  const id = item.product ? String(item.product) : "";
  return costMap[id] || 0;
}

function saleProfit(sale, costMap = {}) {
  let cogs = 0;
  for (const it of sale.items || []) {
    const netQty = Math.max(0, (it.quantity || 0) - (it.returnedQty || 0));
    cogs += unitCostFor(it, costMap) * netQty;
  }
  const netRevenue = round2((sale.total || 0) - (sale.returnedAmount || 0));
  const cogsR = round2(cogs);
  return { netRevenue, cogs: cogsR, profit: round2(netRevenue - cogsR) };
}

// Aggregate profit/revenue across a list of sales.
function aggregateProfit(sales = [], costMap = {}) {
  let revenue = 0;
  let cogs = 0;
  let profit = 0;
  for (const s of sales) {
    const p = saleProfit(s, costMap);
    revenue += p.netRevenue;
    cogs += p.cogs;
    profit += p.profit;
  }
  return { revenue: round2(revenue), cogs: round2(cogs), profit: round2(profit), orders: sales.length };
}

module.exports = { saleProfit, aggregateProfit, round2 };
