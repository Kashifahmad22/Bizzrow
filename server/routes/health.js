const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const AIInsight = require("../models/AIInsight");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { computeHealth, generateActionInsights } = require("../services/healthService");
const ai = require("../services/aiService");

const router = express.Router();
router.use(protect);

async function gatherAndCompute(req) {
  const ownerId = req.user._id;
  const threshold = req.user.preferences?.lowStockThreshold ?? 5;
  const since = new Date(Date.now() - 90 * 86400000);

  const [products, sales, customers] = await Promise.all([
    Product.find({ owner: ownerId }).select("stock soldCount costPrice sellingPrice createdAt"),
    Sale.find({ owner: ownerId, createdAt: { $gte: since } }).select(
      "total amountPaid dueAmount payments customer createdAt"
    ),
    Customer.find({ owner: ownerId }).select(
      "pendingBalance totalPurchased totalPaid lastPurchaseAt createdAt"
    ),
  ]);

  return computeHealth({ products, sales, customers, threshold });
}

function narrativeFromInsights(insights) {
  const out = { strengths: [], risks: [], opportunities: [] };
  for (const ins of insights) {
    if (ins.kind === "health_strength") out.strengths.push(ins.body);
    else if (ins.kind === "health_risk") out.risks.push(ins.body);
    else if (ins.kind === "growth_opportunity") out.opportunities.push(ins.body);
  }
  return out;
}

// GET /api/business-health/score — deterministic score + any cached AI narrative
router.get(
  "/score",
  asyncHandler(async (req, res) => {
    const health = await gatherAndCompute(req);
    const insights = await AIInsight.find({
      owner: req.user._id,
      kind: { $in: ["health_strength", "health_risk", "growth_opportunity"] },
    })
      .sort({ createdAt: -1 })
      .limit(12);
    res.json({ health, narrative: narrativeFromInsights(insights) });
  })
);

// POST /api/business-health/refresh — recompute + regenerate the AI Strengths/Risks narrative
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const ownerId = req.user._id;
    const health = await gatherAndCompute(req);

    if (health.insufficientData) {
      return res.json({
        health,
        narrative: { strengths: [], risks: [], opportunities: [] },
        message: "Add a few products and sales to unlock AI health insights.",
      });
    }

    const narrative = await ai.generateHealthNarrative({
      overall: health.overall,
      category: health.category,
      subScores: health.subScores,
      metrics: health.metrics,
    });

    // Replace today's narrative rows so they don't accumulate.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    await AIInsight.deleteMany({
      owner: ownerId,
      kind: { $in: ["health_strength", "health_risk", "growth_opportunity"] },
      createdAt: { $gte: startOfDay },
    });

    const rows = [
      ...narrative.strengths.map((b) => ({ kind: "health_strength", body: b, severity: "good", title: "Strength" })),
      ...narrative.risks.map((b) => ({ kind: "health_risk", body: b, severity: "warn", title: "Risk" })),
      ...narrative.opportunities.map((b) => ({ kind: "growth_opportunity", body: b, severity: "info", title: "Opportunity" })),
    ].map((r) => ({ ...r, owner: ownerId }));

    if (rows.length > 0) await AIInsight.insertMany(rows);

    res.json({ health, narrative });
  })
);

// GET /api/business-health/actions — deterministic action-oriented insights
// (recover dues, restock, idle stock, collection efficiency, revenue concentration).
router.get(
  "/actions",
  asyncHandler(async (req, res) => {
    const ownerId = req.user._id;
    const threshold = req.user.preferences?.lowStockThreshold ?? 5;
    const since = new Date(Date.now() - 90 * 86400000);
    const [products, sales, customers] = await Promise.all([
      Product.find({ owner: ownerId }).select("name stock soldCount costPrice createdAt"),
      Sale.find({ owner: ownerId, createdAt: { $gte: since } }).select("total amountPaid customer createdAt items"),
      Customer.find({ owner: ownerId }).select("name pendingBalance totalPurchased lastPurchaseAt"),
    ]);
    const actions = generateActionInsights({ products, sales, customers, threshold });
    res.json({ actions });
  })
);

module.exports = router;
