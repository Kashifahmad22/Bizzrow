const express = require("express");
const Customer = require("../models/Customer");
const LedgerEntry = require("../models/LedgerEntry");
const Sale = require("../models/Sale");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const whatsapp = require("../services/whatsappService");
const { buildLedgerStatementPdf } = require("../services/pdfService");
const { round2 } = require("../utils/saleMath");
const { allocateLedgerPayment } = require("../services/paymentAllocation");
const { buildLedgerStatement } = require("../services/ledgerStatement");
const {
  executeIdempotently,
  requestFingerprint,
  requireIdempotencyKey,
} = require("../services/financialTransaction");

const router = express.Router();
router.use(protect);

// Compute a ledger statement: opening balance (signed sum before `from`),
// running balance per in-range entry, and closing balance. Reused by JSON + PDF.
async function computeStatement(ownerId, customer, from, to) {
  const all = await LedgerEntry.find({ owner: ownerId, customer: customer._id }).sort({ createdAt: 1 });
  return buildLedgerStatement(customer, all, from, to);
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
    const key = requireIdempotencyKey(req);
    const fingerprint = requestFingerprint("ledger:payment", { customerId: req.params.customerId }, req.body);
    const result = await executeIdempotently({
      ownerId: req.user._id,
      operation: `ledger-payment:${req.params.customerId}`,
      key,
      fingerprint,
      work: async (session) => {
        const amount = Number(req.body.amount);
        const paymentMethod = req.body.paymentMethod || "cash";
        const normalizedAmount = round2(amount);
        if (!Number.isFinite(amount) || normalizedAmount <= 0) {
          throw Object.assign(new Error("Positive amount of at least 0.01 is required"), { status: 400 });
        }
        if (!["cash", "upi", "bank", "card"].includes(paymentMethod)) {
          throw Object.assign(new Error("Payment method must be cash, upi, bank, or card"), { status: 400 });
        }
        const customer = await Customer.findOne({
          _id: req.params.customerId,
          owner: req.user._id,
        }).session(session);
        if (!customer) throw Object.assign(new Error("Customer not found"), { status: 404 });
        const outstanding = round2(customer.pendingBalance || 0);
        if (normalizedAmount > outstanding) {
          throw Object.assign(new Error("Payment cannot exceed the customer's outstanding balance"), { status: 400 });
        }

        const openSales = await Sale.find({
          owner: req.user._id,
          customer: customer._id,
          dueAmount: { $gt: 0 },
        }).sort({ createdAt: 1, _id: 1 }).session(session);
        const saleDueTotal = round2(openSales.reduce((sum, sale) => sum + (sale.dueAmount || 0), 0));
        if (Math.abs(saleDueTotal - outstanding) > 0.001) {
          throw Object.assign(new Error("Customer balance does not reconcile with outstanding sales"), { status: 409 });
        }
        const collectedAt = new Date();
        const allocatedSales = allocateLedgerPayment(openSales, normalizedAmount, paymentMethod, collectedAt);
        for (const sale of allocatedSales) await sale.save({ session });
        customer.pendingBalance = round2(outstanding - normalizedAmount);
        customer.totalPaid = round2((customer.totalPaid || 0) + normalizedAmount);
        await customer.save({ session });
        const [entry] = await LedgerEntry.create([{
          owner: req.user._id,
          customer: customer._id,
          type: "payment",
          amount: -normalizedAmount,
          balanceAfter: customer.pendingBalance,
          collectionSource: "ledger",
          paymentMethod,
          note: req.body.note || "Payment received",
        }], { session });
        return {
          resultType: "ledger-payment",
          resultId: entry._id,
          relatedResourceId: customer._id,
          value: { customer, entry },
        };
      },
      replay: async (record) => {
        const [customer, entry] = await Promise.all([
          Customer.findOne({ _id: record.relatedResourceId, owner: req.user._id }),
          LedgerEntry.findOne({ _id: record.resultId, owner: req.user._id }),
        ]);
        if (!customer || !entry) throw new Error("Idempotent payment record references missing resources");
        return { customer, entry };
      },
    });
    res.status(201).json(result);
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
