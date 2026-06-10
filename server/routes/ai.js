const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const AIInsight = require("../models/AIInsight");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const ai = require("../services/aiService");

const router = express.Router();
router.use(protect);

// GET /api/ai/insights — latest cached insights
router.get(
  "/insights",
  asyncHandler(async (req, res) => {
    const insights = await AIInsight.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ insights });
  })
);

// POST /api/ai/insights/refresh — pull recent business data, prompt Gemini, persist insights
router.post(
  "/insights/refresh",
  asyncHandler(async (req, res) => {
    const ownerId = req.user._id;

    // Snapshot recent activity. Keep payload small to control cost.
    const [sales, products, customers] = await Promise.all([
      Sale.find({ owner: ownerId })
        .sort({ createdAt: -1 })
        .limit(40)
        .select("customerName items total amountPaid dueAmount paymentStatus createdAt"),
      Product.find({ owner: ownerId }).select("name category color size stock soldCount sellingPrice"),
      Customer.find({ owner: ownerId })
        .sort({ updatedAt: -1 })
        .limit(20)
        .select("name pendingBalance totalPurchased lastPurchaseAt"),
    ]);

    const compactSales = sales.map((s) => ({
      customer: s.customerName,
      items: s.items.map((it) => ({ name: it.name, size: it.size, color: it.color, quantity: it.quantity })),
      total: s.total,
      due: s.dueAmount,
      status: s.paymentStatus,
      date: s.createdAt.toISOString().slice(0, 10),
    }));
    const compactProducts = products.map((p) => ({
      name: p.name,
      category: p.category,
      color: p.color,
      size: p.size,
      stock: p.stock,
      sold: p.soldCount,
      price: p.sellingPrice,
    }));
    const compactCustomers = customers.map((c) => ({
      name: c.name,
      pending: c.pendingBalance,
      purchased: c.totalPurchased,
      lastPurchase: c.lastPurchaseAt ? c.lastPurchaseAt.toISOString().slice(0, 10) : null,
    }));

    const insights = await ai.generateInsights({
      sales: compactSales,
      products: compactProducts,
      customers: compactCustomers,
    });

    if (insights.length === 0) {
      res.status(502);
      throw new Error("AI did not return any insights. Please try again.");
    }

    // Replace today's insights so the dashboard does not accumulate stale rows.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    await AIInsight.deleteMany({ owner: ownerId, createdAt: { $gte: startOfDay } });

    const docs = await AIInsight.insertMany(
      insights.map((i) => ({
        owner: ownerId,
        kind: i.kind || "daily_summary",
        title: i.title || "Insight",
        body: i.body || "",
        severity: i.severity || "info",
        meta: i.meta || {},
      }))
    );

    res.json({ insights: docs });
  })
);

// POST /api/ai/marketing — generate WhatsApp marketing copy for a product
router.post(
  "/marketing",
  asyncHandler(async (req, res) => {
    const { productId } = req.body;
    const product = await Product.findOne({ _id: productId, owner: req.user._id });
    if (!product) {
      res.status(404);
      throw new Error("Product not found");
    }
    const message = await ai.generateMarketingCopy({
      product,
      businessName: req.user.business?.name,
    });
    res.json({ message });
  })
);

module.exports = router;
