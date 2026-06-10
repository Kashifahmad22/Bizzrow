/**
 * Business Health engine — DETERMINISTIC.
 *
 * Computes a transparent 0-100 Business Health Score from six weighted
 * sub-scores. No AI, no randomness: same data in → same score out. The AI layer
 * (aiService.generateHealthNarrative) only writes the human Strengths/Risks
 * narrative on top of these numbers.
 *
 * All functions are pure — the route fetches data and passes plain objects in.
 * Weights and thresholds are intentionally easy to tune after demo feedback.
 */

const DAY = 86400000;

const WEIGHTS = {
  payment: 0.2,
  cashFlow: 0.2,
  sales: 0.2,
  inventory: 0.15,
  productPerformance: 0.125,
  customer: 0.125,
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n) => Math.round(n);
const ageDays = (date, now) => (date ? (now - new Date(date).getTime()) / DAY : Infinity);

/**
 * Bucket products into fast / slow / low-stock / dead / out-of-stock / new.
 * Reused by both the health score and the dashboard's Inventory Intelligence widget.
 */
function bucketInventory(products, threshold = 5, now = Date.now()) {
  const fast = [];
  const slow = [];
  const low = [];
  const dead = [];
  const out = [];
  let inventoryValue = 0;

  for (const p of products) {
    inventoryValue += (p.stock || 0) * (p.costPrice || 0);
    const sold = p.soldCount || 0;
    const age = ageDays(p.createdAt, now);

    if (p.stock === 0) out.push(p);
    else if (p.stock <= threshold) low.push(p);

    if (sold >= 5) fast.push(p);
    else if (sold > 0) slow.push(p);
    else if (age >= 30) dead.push(p); // never sold AND older than 30 days
  }

  return {
    fast,
    slow,
    low,
    dead,
    out,
    inventoryValue: round(inventoryValue),
    counts: {
      total: products.length,
      fast: fast.length,
      slow: slow.length,
      low: low.length,
      dead: dead.length,
      out: out.length,
    },
  };
}

function sumPaidInRange(sales, start, end) {
  let sum = 0;
  for (const s of sales) {
    const t = new Date(s.createdAt).getTime();
    if (t >= start && t < end) sum += s.amountPaid || 0;
  }
  return sum;
}

function sumRevenueInRange(sales, start, end) {
  let sum = 0;
  for (const s of sales) {
    const t = new Date(s.createdAt).getTime();
    if (t >= start && t < end) sum += s.total || 0;
  }
  return sum;
}

// --- Sub-scores (each 0-100) ---

function inventoryScore(buckets) {
  const { counts } = buckets;
  if (counts.total === 0) return null;
  const deadRatio = counts.dead / counts.total;
  const outRatio = counts.out / counts.total;
  const lowRatio = counts.low / counts.total;
  return clamp(100 - deadRatio * 45 - outRatio * 25 - lowRatio * 15);
}

function cashFlowScore(sales, now) {
  if (sales.length === 0) return null;
  // Consistency: distinct days with a collection in the last 30 days.
  const start = now - 30 * DAY;
  const days = new Set();
  for (const s of sales) {
    const t = new Date(s.createdAt).getTime();
    if (t >= start && (s.amountPaid || 0) > 0) {
      days.add(new Date(s.createdAt).toISOString().slice(0, 10));
    }
  }
  // Collecting on ~15 of 30 days is already excellent for a small shop.
  const consistency = clamp((days.size / 15) * 100) / 100; // 0..1

  // Trend: last 15 days collected vs prior 15 days.
  const recent = sumPaidInRange(sales, now - 15 * DAY, now);
  const prior = sumPaidInRange(sales, now - 30 * DAY, now - 15 * DAY);
  const ratio = prior > 0 ? recent / prior : recent > 0 ? 1.2 : 0;
  const trend = clamp(ratio / 1.5, 0, 1); // 0..1, caps at +50% growth

  return clamp(consistency * 60 + trend * 40);
}

function paymentScore(sales, customers, now) {
  if (sales.length === 0) return null;
  const billed = sales.reduce((a, s) => a + (s.total || 0), 0);
  const paid = sales.reduce((a, s) => a + (s.amountPaid || 0), 0);
  const efficiency = billed > 0 ? paid / billed : 1; // 0..1
  const effScore = efficiency * 70;

  // Overdue penalty: total pending relative to one month of revenue.
  const monthRevenue = sumRevenueInRange(sales, now - 30 * DAY, now) || billed / 6 || 1;
  const pending = customers.reduce((a, c) => a + Math.max(0, c.pendingBalance || 0), 0);
  const overdueRatio = pending / monthRevenue;
  const penalty = clamp(overdueRatio * 30, 0, 30);

  return clamp(effScore + (30 - penalty));
}

function salesScore(sales, customers, now) {
  if (sales.length === 0) return null;
  // Growth: revenue last 30 vs prior 30 days.
  const recent = sumRevenueInRange(sales, now - 30 * DAY, now);
  const prior = sumRevenueInRange(sales, now - 60 * DAY, now - 30 * DAY);
  const ratio = prior > 0 ? recent / prior : recent > 0 ? 1.2 : 0;
  const growth = clamp(ratio / 2, 0, 1); // caps at 2x growth

  // Repeat customers: how many bought more than once.
  const perCustomer = {};
  for (const s of sales) {
    if (!s.customer) continue; // walk-ins excluded
    const id = String(s.customer);
    perCustomer[id] = (perCustomer[id] || 0) + 1;
  }
  const buyers = Object.keys(perCustomer).length;
  const repeat = Object.values(perCustomer).filter((n) => n > 1).length;
  const repeatRatio = buyers > 0 ? repeat / buyers : 0;

  return clamp(growth * 50 + repeatRatio * 50);
}

function productPerformanceScore(buckets) {
  const { counts } = buckets;
  if (counts.total === 0) return null;
  const movingRatio = (counts.fast + counts.slow) / counts.total;
  const fastRatio = counts.fast / counts.total;
  return clamp(movingRatio * 65 + fastRatio * 35);
}

function customerScore(customers, now) {
  if (customers.length === 0) return null;
  let active = 0;
  let repeat = 0;
  for (const c of customers) {
    if (ageDays(c.lastPurchaseAt, now) <= 45) active++;
    // Heuristic: repeat buyers tend to have purchased materially more than one bill.
    if ((c.totalPurchased || 0) > 0 && (c.totalPaid || 0) >= 0 && (c.totalPurchased || 0) > 1) {
      // refined below using sales if available; kept simple here
    }
  }
  const activeRatio = active / customers.length;
  // Repeat behaviour approximated by share of customers who are still active.
  repeat = active;
  const repeatRatio = customers.length > 0 ? repeat / customers.length : 0;
  return clamp(activeRatio * 60 + repeatRatio * 40);
}

function categoryFor(score) {
  if (score >= 90) return { label: "Excellent", tone: "good" };
  if (score >= 75) return { label: "Healthy", tone: "good" };
  if (score >= 60) return { label: "Needs Attention", tone: "warn" };
  return { label: "Critical", tone: "critical" };
}

/**
 * Main entry. Returns { insufficientData, overall, category, subScores, metrics }.
 */
function computeHealth({ products = [], sales = [], customers = [], threshold = 5, now = Date.now() }) {
  const buckets = bucketInventory(products, threshold, now);

  if (sales.length === 0 && products.length === 0) {
    return {
      insufficientData: true,
      overall: null,
      category: { label: "Not enough data", tone: "info" },
      subScores: {},
      metrics: { inventoryValue: 0, ...buckets.counts },
    };
  }

  const sub = {
    inventory: inventoryScore(buckets),
    cashFlow: cashFlowScore(sales, now),
    payment: paymentScore(sales, customers, now),
    sales: salesScore(sales, customers, now),
    productPerformance: productPerformanceScore(buckets),
    customer: customerScore(customers, now),
  };

  // Weighted overall across only the sub-scores we could compute.
  let weightedSum = 0;
  let weightUsed = 0;
  for (const key of Object.keys(WEIGHTS)) {
    if (sub[key] != null) {
      weightedSum += sub[key] * WEIGHTS[key];
      weightUsed += WEIGHTS[key];
    }
  }
  const overall = weightUsed > 0 ? round(weightedSum / weightUsed) : 50;

  // Round sub-scores for display.
  const subScores = {};
  for (const k of Object.keys(sub)) subScores[k] = sub[k] == null ? null : round(sub[k]);

  // Metrics surfaced for the UI + AI narrative.
  const billed = sales.reduce((a, s) => a + (s.total || 0), 0);
  const paid = sales.reduce((a, s) => a + (s.amountPaid || 0), 0);
  const pending = customers.reduce((a, c) => a + Math.max(0, c.pendingBalance || 0), 0);
  const overdueCustomers = customers.filter((c) => (c.pendingBalance || 0) > 0).length;
  const activeCustomers = customers.filter((c) => ageDays(c.lastPurchaseAt, now) <= 45).length;
  const dormantCustomers = customers.length - activeCustomers;
  const revenue30 = sumRevenueInRange(sales, now - 30 * DAY, now);
  const revenuePrev30 = sumRevenueInRange(sales, now - 60 * DAY, now - 30 * DAY);

  const metrics = {
    inventoryValue: buckets.inventoryValue,
    ...buckets.counts,
    collectionEfficiency: billed > 0 ? round((paid / billed) * 100) : 100,
    pendingTotal: round(pending),
    overdueCustomers,
    activeCustomers,
    dormantCustomers,
    totalCustomers: customers.length,
    revenue30: round(revenue30),
    revenuePrev30: round(revenuePrev30),
    revenueGrowthPct:
      revenuePrev30 > 0 ? round(((revenue30 - revenuePrev30) / revenuePrev30) * 100) : null,
  };

  return {
    insufficientData: false,
    overall,
    category: categoryFor(overall),
    subScores,
    metrics,
  };
}

/**
 * Action-oriented business insights (Final Sprint — BI v2).
 * Deterministic and SPECIFIC: every item names the product/customer, shows
 * supporting data, and gives a suggested action with a priority. Not a chatbot.
 * Shape: { kind, priority, title, metrics: [{label, value}], action }.
 */
const PRIORITY_WEIGHT = { urgent: 0, important: 1, opportunity: 2 };

function generateActionInsights({ products = [], sales = [], customers = [], threshold = 5, now = Date.now() }) {
  const out = [];
  const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const ageDays = (d) => (d ? (now - new Date(d).getTime()) / 86400000 : 9999);

  // 1) Outstanding dues — named, with the largest debtor.
  const owing = customers.filter((c) => (c.pendingBalance || 0) > 0).sort((a, b) => b.pendingBalance - a.pendingBalance);
  const pendingTotal = owing.reduce((a, c) => a + c.pendingBalance, 0);
  if (pendingTotal > 0) {
    const top = owing[0];
    out.push({
      kind: "recover_dues",
      priority: pendingTotal >= 10000 || owing.length >= 3 ? "urgent" : "important",
      title: `Recover ${inr(pendingTotal)} from ${owing.length} customer${owing.length === 1 ? "" : "s"}`,
      metrics: [top && { label: "Largest outstanding", value: `${top.name} — ${inr(top.pendingBalance)}` }].filter(Boolean),
      action: "Contact your top overdue customers.",
    });
  }

  // 2) Low stock + stockout forecast — per product (top 2 most urgent).
  const lowRisk = products
    .filter((p) => p.stock > 0 && (p.soldCount || 0) > 0)
    .map((p) => {
      const perDay = (p.soldCount || 0) / Math.max(7, Math.min(90, ageDays(p.createdAt)));
      const daysLeft = perDay > 0 ? p.stock / perDay : Infinity;
      return { p, perWeek: perDay * 7, daysLeft };
    })
    .filter((x) => x.p.stock <= threshold || x.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 2);
  lowRisk.forEach(({ p, perWeek, daysLeft }) => {
    out.push({
      kind: "low_stock",
      priority: daysLeft <= 3 ? "urgent" : "important",
      title: `${p.name} is running low`,
      metrics: [
        { label: "Current stock", value: `${p.stock} units` },
        { label: "Avg weekly sales", value: `${Math.round(perWeek)} units` },
        { label: "Est. stockout", value: isFinite(daysLeft) ? `${Math.max(1, Math.round(daysLeft))} days` : "—" },
      ],
      action: "Restock now.",
    });
  });

  // 3) Slow / dead inventory — per product (top 2 by blocked value).
  const dead = products
    .filter((p) => (p.soldCount || 0) === 0 && ageDays(p.createdAt) >= 45)
    .map((p) => ({ p, blocked: (p.stock || 0) * (p.costPrice || 0), days: Math.round(ageDays(p.createdAt)) }))
    .sort((a, b) => b.blocked - a.blocked)
    .slice(0, 2);
  dead.forEach(({ p, blocked, days }) => {
    out.push({
      kind: "slow_moving",
      priority: "opportunity",
      title: `${p.name} isn't selling`,
      metrics: [
        { label: "In stock", value: `${p.stock} units` },
        { label: "No sale in", value: `${days} days` },
        { label: "Blocked value", value: inr(blocked) },
      ],
      action: "Run a discount or promotion.",
    });
  });

  // 4) Fast mover — top product's revenue share (last 30 days).
  const since30 = now - 30 * 86400000;
  const prodRev = {};
  for (const s of sales) {
    if (new Date(s.createdAt).getTime() < since30) continue;
    for (const it of s.items || []) prodRev[String(it.product)] = (prodRev[String(it.product)] || 0) + (it.subtotal || 0);
  }
  const totalItemRev = Object.values(prodRev).reduce((a, n) => a + n, 0);
  if (totalItemRev > 0) {
    const [pid, rev] = Object.entries(prodRev).sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round((rev / totalItemRev) * 100);
    if (pct >= 20) {
      const prod = products.find((p) => String(p._id) === pid);
      out.push({
        kind: "fast_moving",
        priority: "opportunity",
        title: `${prod?.name || "Your top product"} generated ${pct}% of monthly revenue`,
        metrics: [{ label: "Revenue (30d)", value: inr(rev) }, prod && { label: "Stock left", value: `${prod.stock} units` }].filter(Boolean),
        action: "Increase stock levels to protect sales.",
      });
    }
  }

  // 5) Collection efficiency.
  const billed = sales.reduce((a, s) => a + (s.total || 0), 0);
  const paid = sales.reduce((a, s) => a + (s.amountPaid || 0), 0);
  if (billed > 0) {
    const eff = Math.round((paid / billed) * 100);
    if (eff < 70) {
      out.push({
        kind: "collection_efficiency",
        priority: "important",
        title: `Collection efficiency is ${eff}%`,
        metrics: [{ label: "Uncollected", value: inr(billed - paid) }],
        action: "Tighten payment follow-ups.",
      });
    }
  }

  return out.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]).slice(0, 7);
}

module.exports = { computeHealth, bucketInventory, categoryFor, WEIGHTS, generateActionInsights };
