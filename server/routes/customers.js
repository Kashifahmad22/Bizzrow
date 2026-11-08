const express = require("express");
const Customer = require("../models/Customer");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { customerId, customerPhone } = require("../utils/customerInput");
const { buildTextFilter } = require("../utils/search");
const { clampLimit, clampPage, pageMeta } = require("../utils/validate");
const { round2 } = require("../utils/saleMath");
const Sale = require("../models/Sale");
const LedgerEntry = require("../models/LedgerEntry");
const ReturnRecord = require("../models/ReturnRecord");
const { runFinancialTransaction } = require("../services/financialTransaction");

const router = express.Router();
router.use(protect);
router.param("id", (req, res, next, value) => {
  try {
    req.params.id = customerId(value);
    next();
  } catch (error) {
    next(error);
  }
});

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
      summary: { totalCustomers: s.count, totalPending: round2(s.totalPending), owing: s.owing },
    });
  })
);

// POST /api/customers
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, phone, shopName, address, gstNumber, notes } = req.body;
    if (!name || !phone) {
      res.status(400);
      throw new Error("name and phone are required");
    }
    try {
      const customer = await Customer.create({
        owner: req.user._id,
        name,
        phone: customerPhone(phone),
        shopName,
        address,
        gstNumber,
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
    const fields = ["name", "phone", "shopName", "address", "gstNumber", "notes"];
    for (const f of fields) if (f in req.body) customer[f] = f === "phone" ? customerPhone(req.body[f]) : req.body[f];
    await customer.save();
    res.json({ customer });
  })
);

// DELETE /api/customers/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await runFinancialTransaction(async (session) => {
      const filter = { _id: req.params.id, owner: req.user._id };
      const customer = await Customer.findOne(filter).session(session);
      if (!customer) throw Object.assign(new Error("Customer not found"), { status: 404 });
      const historyFilter = { owner: req.user._id, customer: customer._id };
      const hasSale = await Sale.exists(historyFilter).session(session);
      const hasLedger = await LedgerEntry.exists(historyFilter).session(session);
      const hasReturn = await ReturnRecord.exists(historyFilter).session(session);
      if (hasSale || hasLedger || hasReturn || customer.pendingBalance || customer.totalPaid || customer.totalPurchased) {
        throw Object.assign(new Error("Customer has financial history or a balance and cannot be deleted. Keep the customer to preserve financial records."), { status: 409 });
      }
      await Customer.deleteOne(filter, { session });
    });
    res.json({ ok: true });
  })
);

module.exports = router;
