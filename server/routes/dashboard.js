const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const LedgerEntry = require("../models/LedgerEntry");
const ReturnRecord = require("../models/ReturnRecord");
const AIInsight = require("../models/AIInsight");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { bucketInventory } = require("../services/healthService");
const { aggregateProfit } = require("../utils/profit");
const { parseRangeStart, parseRangeEnd } = require("../utils/dateRange");
const { allocateCents } = require("../utils/saleMath");
const {
  ACTUAL_TENDER_METHODS,
  methodAggToObject,
  refundCollectionPipeline,
} = require("../utils/collectionReconciliation");

const router = express.Router();
router.use(protect);

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function saleCollectionPaymentsExpression() {
  return {
    $cond: [
      { $ne: [{ $type: "$collectionPayments" }, "missing"] },
      { $ifNull: ["$collectionPayments", []] },
      {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
          "$payments",
          { $cond: [
            { $in: ["$paymentMethod", ACTUAL_TENDER_METHODS] },
            [{ method: "$paymentMethod", amount: { $ifNull: ["$amountPaid", 0] }, source: "sale" }],
            [],
          ] },
        ],
      },
    ],
  };
}

function actualSaleCollectionExpression() {
  return {
    $reduce: {
      input: { $filter: {
        input: saleCollectionPaymentsExpression(),
        as: "payment",
        cond: { $and: [
          { $in: ["$$payment.method", ACTUAL_TENDER_METHODS] },
          { $ne: ["$$payment.source", "ledger"] },
        ] },
      } },
      initialValue: 0,
      in: { $add: ["$$value", "$$this.amount"] },
    },
  };
}

function saleCollectionsByMethod(ownerId, createdAt) {
  return [
    { $match: { owner: ownerId, createdAt } },
    { $project: { payments: saleCollectionPaymentsExpression() } },
    { $unwind: "$payments" },
    { $match: { "payments.source": { $ne: "ledger" }, "payments.method": { $in: ACTUAL_TENDER_METHODS } } },
    { $group: { _id: "$payments.method", amount: { $sum: "$payments.amount" } } },
  ];
}

function ledgerCollectionFilter(ownerId, createdAt) {
  return {
    owner: ownerId,
    type: "payment",
    ...(createdAt ? { createdAt } : {}),
    $or: [
      { collectionSource: "ledger" },
      { collectionSource: { $exists: false }, reference: null },
    ],
  };
}

function slimProduct(p) {
  return {
    _id: p._id,
    name: p.name,
    color: p.color,
    size: p.size,
    category: p.category,
    stock: p.stock,
    soldCount: p.soldCount,
    image: p.image,
    sellingPrice: p.sellingPrice,
  };
}

// GET /api/dashboard/summary
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const ownerId = req.user._id;
    const threshold = req.user.preferences?.lowStockThreshold ?? 5;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      salesAgg,
      salesToday,
      collectTodayRows,
      collectMonthRows,
      customersAgg,
      products,
      dailySeries,
      latestInsights,
      recentSales,
      recentCustomers,
      salesMonthFull,
      historicalCollectionsIncomplete,
    ] = await Promise.all([
      Sale.aggregate([
        { $match: { owner: ownerId, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, totalRevenue: { $sum: { $subtract: ["$total", { $ifNull: ["$returnedAmount", 0] }] } }, totalDue: { $sum: "$dueAmount" }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { owner: ownerId, createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: { $subtract: ["$total", { $ifNull: ["$returnedAmount", 0] }] } }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate(saleCollectionsByMethod(ownerId, { $gte: startOfDay })),
      Sale.aggregate(saleCollectionsByMethod(ownerId, { $gte: startOfMonth })),
      Customer.aggregate([
        { $match: { owner: ownerId } },
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            totalPending: { $sum: "$pendingBalance" },
            owingCustomers: { $sum: { $cond: [{ $gt: ["$pendingBalance", 0] }, 1, 0] } },
          },
        },
      ]),
      Product.find({ owner: ownerId }).select("name category color size stock soldCount sellingPrice costPrice image createdAt"),
      Sale.aggregate([
        { $match: { owner: ownerId, createdAt: { $gte: new Date(now.getTime() - 13 * 86400000) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: { $subtract: ["$total", { $ifNull: ["$returnedAmount", 0] }] } },
            collected: { $sum: actualSaleCollectionExpression() },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AIInsight.find({ owner: ownerId, kind: { $nin: ["health_strength", "health_risk", "growth_opportunity"] } })
        .sort({ createdAt: -1 })
        .limit(6),
      Sale.find({ owner: ownerId }).sort({ createdAt: -1 }).limit(6).select("customerName total paymentStatus invoiceNumber createdAt items"),
      Customer.find({ owner: ownerId }).sort({ updatedAt: -1 }).limit(6).select("name shopName phone pendingBalance lastPurchaseAt"),
      Sale.find({ owner: ownerId, createdAt: { $gte: startOfMonth } }).select("items total returnedAmount"),
      Sale.exists({ owner: ownerId, collectionPayments: { $exists: false } }),
    ]);

    const monthly = salesAgg[0] || { totalRevenue: 0, totalDue: 0, count: 0 };
    const today = salesToday[0] || { total: 0, count: 0 };
    const cust = customersAgg[0] || { totalCustomers: 0, totalPending: 0, owingCustomers: 0 };
    const [
      ledgerTodayRows,
      ledgerMonthRows,
      refundTodayRows,
      refundMonthRows,
      ledgerDailyRows,
      cashRefundDailyRows,
    ] = await Promise.all([
      LedgerEntry.aggregate([
        { $match: ledgerCollectionFilter(ownerId, { $gte: startOfDay }) },
        { $group: { _id: { $ifNull: ["$paymentMethod", "cash"] }, amount: { $sum: { $multiply: ["$amount", -1] } } } },
      ]),
      LedgerEntry.aggregate([
        { $match: ledgerCollectionFilter(ownerId, { $gte: startOfMonth }) },
        { $group: { _id: { $ifNull: ["$paymentMethod", "cash"] }, amount: { $sum: { $multiply: ["$amount", -1] } } } },
      ]),
      ReturnRecord.aggregate(refundCollectionPipeline(ownerId, { $gte: startOfDay })),
      ReturnRecord.aggregate(refundCollectionPipeline(ownerId, { $gte: startOfMonth })),
      LedgerEntry.aggregate([
        { $match: ledgerCollectionFilter(ownerId, { $gte: new Date(now.getTime() - 13 * 86400000) }) },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amount: { $sum: { $multiply: ["$amount", -1] } } } },
      ]),
      ReturnRecord.aggregate(refundCollectionPipeline(
        ownerId,
        { $gte: new Date(now.getTime() - 13 * 86400000) },
        { trend: true }
      )),
    ]);

    const collectionToday = methodAggToObject([
      ...collectTodayRows,
      ...ledgerTodayRows,
      ...refundTodayRows.map((row) => ({ _id: row._id, amount: -row.amount })),
    ]);
    const collectionMonth = methodAggToObject([
      ...collectMonthRows,
      ...ledgerMonthRows,
      ...refundMonthRows.map((row) => ({ _id: row._id, amount: -row.amount })),
    ]);

    // Profit this month (net of discounts + returns), via cost snapshots + fallback.
    const costMap = {};
    for (const p of products) costMap[String(p._id)] = p.costPrice || 0;
    const monthProfit = aggregateProfit(salesMonthFull, costMap);

    // Inventory buckets + value (computed in JS over the small catalog).
    const buckets = bucketInventory(products, threshold, now.getTime());
    const lowStock = [...buckets.low, ...buckets.out]
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5)
      .map(slimProduct);
    const topSellers = products
      .filter((p) => p.soldCount > 0)
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 5)
      .map(slimProduct);

    // Dense 14-day series.
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = dailySeries.find((x) => x._id === key);
      const ledgerCollected = ledgerDailyRows.find((x) => x._id === key)?.amount || 0;
      const cashRefunded = cashRefundDailyRows.find((x) => x._id === key)?.amount || 0;
      series.push({
        date: key,
        revenue: found ? Math.round(found.revenue) : 0,
        collected: roundCurrency((found?.collected || 0) + ledgerCollected - cashRefunded),
        count: found ? found.count : 0,
      });
    }

    res.json({
      summary: {
        salesThisMonth: Math.round(monthly.totalRevenue),
        salesCountThisMonth: monthly.count,
        salesToday: Math.round(today.total),
        salesCountToday: today.count,
        collectionToday: collectionToday.total,
        pendingPayments: Math.round(cust.totalPending),
        customersOwing: cust.owingCustomers,
        totalCustomers: cust.totalCustomers,
        lowStockCount: buckets.counts.low + buckets.counts.out,
        inventoryValue: buckets.inventoryValue,
        profitThisMonth: monthProfit.profit,
      },
      collection: {
        today: { ...collectionToday.breakdown, total: collectionToday.total },
        month: { ...collectionMonth.breakdown, total: collectionMonth.total },
        historicalIncomplete: Boolean(historicalCollectionsIncomplete),
      },
      inventory: {
        value: buckets.inventoryValue,
        counts: buckets.counts,
        fast: buckets.fast.slice(0, 5).map(slimProduct),
        slow: buckets.slow.slice(0, 5).map(slimProduct),
        low: buckets.low.slice(0, 5).map(slimProduct),
        dead: buckets.dead.slice(0, 5).map(slimProduct),
      },
      lowStock,
      topSellers,
      series,
      insights: latestInsights,
      recentSales,
      recentCustomers,
    });
  })
);

// GET /api/dashboard/analytics?metric=revenue|collection|outstanding|inventory&from&to
router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const ownerId = req.user._id;
    const threshold = req.user.preferences?.lowStockThreshold ?? 5;
    const metric = req.query.metric || "revenue";
    const now = new Date();
    const from = parseRangeStart(req.query.from) || new Date(now.getFullYear(), now.getMonth(), 1);
    const to = parseRangeEnd(req.query.to) || now;

    if (metric === "revenue") {
      const [sales, products] = await Promise.all([
        Sale.find({ owner: ownerId, createdAt: { $gte: from, $lte: to } }).select("items total returnedAmount customer"),
        Product.find({ owner: ownerId }).select("name costPrice"),
      ]);
      const costMap = {};
      const nameMap = {};
      products.forEach((p) => { costMap[String(p._id)] = p.costPrice || 0; nameMap[String(p._id)] = p.name; });
      const agg = aggregateProfit(sales, costMap);
      const prodRev = {};
      const custRev = {};
      for (const s of sales) {
        const net = (s.total || 0) - (s.returnedAmount || 0);
        if (s.customer) custRev[String(s.customer)] = (custRev[String(s.customer)] || 0) + net;
        const items = s.items || [];
        const lineValues = allocateCents(s.total || 0, items.map((item) => (
          item.subtotal != null ? item.subtotal : (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)
        )));
        for (const [index, it] of items.entries()) {
          const q = Number(it.quantity) || 0;
          const returnedQ = Math.min(q, Number(it.returnedQty) || 0);
          const returnedCents = q > 0 ? Math.round(lineValues[index] * returnedQ / q) : 0;
          const lineNet = (lineValues[index] - returnedCents) / 100;
          prodRev[String(it.product)] = (prodRev[String(it.product)] || 0) + lineNet;
        }
      }
      const topProducts = Object.entries(prodRev).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, rev]) => ({ name: nameMap[id] || "Product", revenue: Math.round(rev) }));
      const custIds = Object.keys(custRev);
      const custDocs = custIds.length ? await Customer.find({ owner: ownerId, _id: { $in: custIds } }).select("name") : [];
      const cnames = {};
      custDocs.forEach((c) => (cnames[String(c._id)] = c.name));
      const topCustomers = Object.entries(custRev).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, rev]) => ({ name: cnames[id] || "Customer", revenue: Math.round(rev) }));
      return res.json({
        metric,
        revenue: agg.revenue,
        profit: agg.profit,
        cogs: agg.cogs,
        orders: agg.orders,
        avgOrderValue: agg.orders ? Math.round(agg.revenue / agg.orders) : 0,
        topProducts,
        topCustomers,
      });
    }

    if (metric === "collection") {
      const trendStart = new Date(now.getTime() - 13 * 86400000);
      const [rangeSales, trendRows, ledgerPayments, cashRefunds, ledgerTrendRows, cashRefundTrendRows, historicalCollectionsIncomplete] = await Promise.all([
        Sale.find({ owner: ownerId, createdAt: { $gte: from, $lte: to } })
          .select("customerName invoiceNumber collectionPayments payments amountPaid paymentMethod createdAt")
          .sort({ createdAt: -1 })
          .limit(100),
        Sale.aggregate([
          { $match: { owner: ownerId, createdAt: { $gte: trendStart } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, collected: { $sum: actualSaleCollectionExpression() } } },
          { $sort: { _id: 1 } },
        ]),
        LedgerEntry.find(ledgerCollectionFilter(ownerId, { $gte: from, $lte: to }))
          .populate("customer", "name").sort({ createdAt: -1 }).limit(100),
        ReturnRecord.find({
          owner: ownerId,
          createdAt: { $gte: from, $lte: to },
          $or: [
            { cashRefund: { $gt: 0 } },
            { cashRefundFromCredit: { $gt: 0 } },
            { cashRefundFromLedger: { $gt: 0 } },
            { "refundPayments.0": { $exists: true } },
          ],
        }).populate("customer", "name").sort({ createdAt: -1 }).limit(100),
        LedgerEntry.aggregate([
          { $match: ledgerCollectionFilter(ownerId, { $gte: trendStart }) },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, collected: { $sum: { $multiply: ["$amount", -1] } } } },
          { $sort: { _id: 1 } },
        ]),
        ReturnRecord.aggregate(refundCollectionPipeline(
          ownerId,
          { $gte: trendStart },
          { trend: true }
        )),
        Sale.exists({ owner: ownerId, collectionPayments: { $exists: false } }),
      ]);
      const records = [];
      for (const s of rangeSales) {
        const payments = s.collectionPayments == null ? s.payments : s.collectionPayments;
        if (payments && payments.length) {
          for (const p of payments) {
            if (ACTUAL_TENDER_METHODS.includes(p.method) && p.source !== "ledger") {
              records.push({ customer: s.customerName, amount: roundCurrency(p.amount), method: p.method, date: p.collectedAt || s.createdAt, reference: s.invoiceNumber });
            }
          }
        } else if (s.collectionPayments == null && ACTUAL_TENDER_METHODS.includes(s.paymentMethod) && s.amountPaid > 0) {
          records.push({ customer: s.customerName, amount: roundCurrency(s.amountPaid), method: s.paymentMethod, date: s.createdAt, reference: s.invoiceNumber });
        }
      }
      for (const entry of ledgerPayments) {
        records.push({
          customer: entry.customer?.name || "Customer",
          amount: roundCurrency(-entry.amount),
          method: entry.paymentMethod || "cash",
          date: entry.createdAt,
          reference: entry.note || "Ledger payment",
        });
      }
      for (const record of cashRefunds) {
        const refundPayments = record.refundPayments || [];
        const collectionRefunds = refundPayments.filter(
          (payment) => ACTUAL_TENDER_METHODS.includes(payment.method)
        );
        if (refundPayments.length > 0) {
          for (const payment of collectionRefunds) {
            records.push({
              customer: record.customer?.name || "Customer",
              amount: -roundCurrency(payment.amount),
              method: payment.method,
              date: record.createdAt,
              reference: record.invoiceNumber || "Return",
            });
          }
        } else {
          const legacyRefund = Number(record.cashRefund) > 0
            ? record.cashRefund
            : (record.cashRefundFromCredit || 0) + (record.cashRefundFromLedger || 0);
          const refundAmount = roundCurrency(legacyRefund);
          if (refundAmount > 0) records.push({
            customer: record.customer?.name || "Customer",
            amount: -refundAmount,
            method: "cash",
            date: record.createdAt,
            reference: record.invoiceNumber || "Return",
          });
        }
      }
      const trend = [];
      for (let i = 13; i >= 0; i--) {
        const dt = new Date(now);
        dt.setDate(dt.getDate() - i);
        const key = dt.toISOString().slice(0, 10);
        const f = trendRows.find((x) => x._id === key);
        const ledgerCollected = ledgerTrendRows.find((x) => x._id === key)?.collected || 0;
        const refunded = cashRefundTrendRows.find((x) => x._id === key)?.amount || 0;
        trend.push({ date: key, collected: roundCurrency((f?.collected || 0) + ledgerCollected - refunded) });
      }
      return res.json({ metric, total: roundCurrency(records.reduce((sum, record) => sum + record.amount, 0)), records, trend, historicalIncomplete: Boolean(historicalCollectionsIncomplete) });
    }

    if (metric === "outstanding") {
      const customers = await Customer.find({ owner: ownerId }).select("name shopName phone pendingBalance lastPurchaseAt");
      const owing = customers.filter((c) => (c.pendingBalance || 0) > 0);
      const overdueCutoff = Date.now() - 30 * 86400000;
      let overdue = 0;
      let upcoming = 0;
      owing.forEach((c) => {
        const last = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : 0;
        if (last < overdueCutoff) overdue += c.pendingBalance;
        else upcoming += c.pendingBalance;
      });
      const records = owing
        .sort((a, b) => b.pendingBalance - a.pendingBalance)
        .slice(0, 50)
        .map((c) => {
          const last = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : 0;
          const days = last ? Math.round((Date.now() - last) / 86400000) : null;
          const risk = days == null ? "Low" : days > 60 ? "High" : days > 30 ? "Medium" : "Low";
          return { _id: c._id, name: c.name, shopName: c.shopName, phone: c.phone, pendingBalance: Math.round(c.pendingBalance), daysOutstanding: days, risk };
        });
      return res.json({
        metric,
        totalDue: Math.round(owing.reduce((a, c) => a + c.pendingBalance, 0)),
        overdue: Math.round(overdue),
        upcoming: Math.round(upcoming),
        owingCount: owing.length,
        records,
      });
    }

    if (metric === "inventory") {
      const products = await Product.find({ owner: ownerId }).select("name stock soldCount costPrice sellingPrice createdAt color size category image");
      const buckets = bucketInventory(products, threshold, now.getTime());
      return res.json({
        metric,
        value: buckets.inventoryValue,
        counts: buckets.counts,
        distribution: {
          healthy: Math.max(0, products.length - buckets.counts.low - buckets.counts.out),
          low: buckets.counts.low,
          out: buckets.counts.out,
        },
        lowStock: [...buckets.low].sort((a, b) => a.stock - b.stock).slice(0, 10).map(slimProduct),
        dead: buckets.dead.slice(0, 10).map(slimProduct),
        fast: buckets.fast.slice(0, 10).map(slimProduct),
        slow: buckets.slow.slice(0, 10).map(slimProduct),
      });
    }

    res.status(400);
    throw new Error("Unknown analytics metric");
  })
);

module.exports = router;
