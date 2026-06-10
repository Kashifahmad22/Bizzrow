const express = require("express");
const Customer = require("../models/Customer");
const LedgerEntry = require("../models/LedgerEntry");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const whatsapp = require("../services/whatsappService");
const { buildLedgerStatementPdf } = require("../services/pdfService");
const { parseRangeStart, parseRangeEnd } = require("../utils/dateRange");

const router = express.Router();
router.use(protect);

// Compute a ledger statement: opening balance (signed sum before `from`),
// running balance per in-range entry, and closing balance. Reused by JSON + PDF.
async function computeStatement(ownerId, customer, from, to) {
  const fromDate = parseRangeStart(from);
  const toDate = parseRangeEnd(to);
  const all = await LedgerEntry.find({ owner: ownerId, customer: customer._id }).sort({ createdAt: 1 });

  let opening = 0;
  const inRange = [];
  for (const e of all) {
    const t = new Date(e.createdAt).getTime();
    if (fromDate && t < fromDate.getTime()) {
      opening += e.amount;
      continue;
    }
    if (toDate && t > toDate.getTime()) continue;
    inRange.push(e);
  }

  let running = opening;
  const entries = inRange.map((e) => {
    running += e.amount;
    return { _id: e._id, date: e.createdAt, type: e.type, note: e.note, amount: e.amount, balance: Math.round(running) };
  });

  return {
    customer: { _id: customer._id, name: customer.name, phone: customer.phone, shopName: customer.shopName },
    openingBalance: Math.round(opening),
    closingBalance: Math.round(running),
    entries,
    from: fromDate,
    to: toDate,
  };
}

// GET /api/ledger/:customerId — full transaction history for a customer
router.get(
  "/:customerId",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.customerId, owner: req.user._id });
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }
    const entries = await LedgerEntry.find({
      owner: req.user._id,
      customer: customer._id,
    }).sort({ createdAt: -1 });
    res.json({ customer, entries });
  })
);

// POST /api/ledger/:customerId/payment — record a payment received
router.post(
  "/:customerId/payment",
  asyncHandler(async (req, res) => {
    const { amount, note } = req.body;
    if (!amount || amount <= 0) {
      res.status(400);
      throw new Error("Positive amount is required");
    }
    const customer = await Customer.findOne({ _id: req.params.customerId, owner: req.user._id });
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }
    customer.pendingBalance = Math.max(0, customer.pendingBalance - amount);
    customer.totalPaid += amount;
    await customer.save();
    const entry = await LedgerEntry.create({
      owner: req.user._id,
      customer: customer._id,
      type: "payment",
      amount: -amount,
      balanceAfter: customer.pendingBalance,
      note: note || "Payment received",
    });
    res.status(201).json({ customer, entry });
  })
);

// POST /api/ledger/:customerId/remind — send a WhatsApp reminder
router.post(
  "/:customerId/remind",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.customerId, owner: req.user._id });
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }
    if (customer.pendingBalance <= 0) {
      res.status(400);
      throw new Error("This customer has no pending balance");
    }
    const result = await whatsapp.sendReminder({
      owner: req.user._id,
      customer,
      amount: customer.pendingBalance,
      businessName: req.user.business?.name,
      upiQr: req.user.business?.upiQr,
    });
    res.json({ ok: true, whatsapp: result });
  })
);

// GET /api/ledger/:customerId/statement?from&to — JSON statement
router.get(
  "/:customerId/statement",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.customerId, owner: req.user._id });
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }
    const statement = await computeStatement(req.user._id, customer, req.query.from, req.query.to);
    res.json({ statement });
  })
);

// GET /api/ledger/:customerId/statement/pdf?from&to — downloadable PDF statement
router.get(
  "/:customerId/statement/pdf",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.customerId, owner: req.user._id });
    if (!customer) {
      res.status(404);
      throw new Error("Customer not found");
    }
    const statement = await computeStatement(req.user._id, customer, req.query.from, req.query.to);
    const pdf = await buildLedgerStatementPdf(customer, req.user.business || {}, statement);
    const safeName = String(customer.name || "customer").replace(/[^a-z0-9]+/gi, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Statement-${safeName}.pdf"`);
    res.send(pdf);
  })
);

module.exports = router;
