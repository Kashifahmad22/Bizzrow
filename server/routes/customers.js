const express = require("express");
const Customer = require("../models/Customer");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { buildTextFilter } = require("../utils/search");
const { clampLimit, clampPage, pageMeta } = require("../utils/validate");

const router = express.Router();
router.use(protect);

// GET /api/customers?q=&page=&limit=
// Returns a page of customers + a portfolio `summary` (totals stay correct even
// when the list is paginated). `q` searches name / phone / shopName.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    const filter = { owner: req.user._id, ...buildTextFilter(q, ["name", "phone", "shopName"]) };
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 25, 100);
    const [customers, total, agg] = await Promise.all([
      Customer.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
      Customer.countDocuments(filter),
      Customer.aggregate([
        { $match: { owner: req.user._id } },
        { $group: { _id: null, totalPending: { $sum: "$pendingBalance" }, owing: { $sum: { $cond: [{ $gt: ["$pendingBalance", 0] }, 1, 0] } }, count: { $sum: 1 } } },
      ]),
    ]);
    const s = agg[0] || { totalPending: 0, owing: 0, count: 0 };
    res.json({
      customers,
      ...pageMeta(total, page, limit),
      summary: { totalCustomers: s.count, totalPending: Math.round(s.totalPending), owing: s.owing },
    });
  })
);

// POST /api/customers
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, phone, shopName, address, notes } = req.body;
    if (!name || !phone) {
      res.status(400);
      throw new Error("name and phone are required");
    }
    try {
      const customer = await Customer.create({
        owner: req.user._id,
        name,
        phone,
        shopName,
        address,
        notes,
      });
      res.status(201).json({ customer });
    } catch (err) {
      if (err.code === 11000) {
        res.status(409);
        throw new Error("A customer with that phone already exists");
      }
      throw err;
    }
  })
);

// PUT /api/customers/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.id, owner: req.user._id });
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }
    const fields = ["name", "phone", "shopName", "address", "notes"];
    for (const f of fields) if (f in req.body) customer[f] = req.body[f];
    await customer.save();
    res.json({ customer });
  })
);

// DELETE /api/customers/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await Customer.deleteOne({ _id: req.params.id, owner: req.user._id });
    if (result.deletedCount === 0) {
      res.status(404);
      throw new Error("Customer not found");
    }
    res.json({ ok: true });
  })
);

module.exports = router;
