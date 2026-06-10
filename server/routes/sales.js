const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const LedgerEntry = require("../models/LedgerEntry");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const whatsapp = require("../services/whatsappService");
const { buildInvoicePdf } = require("../services/pdfService");
const { buildSalesFilter, resolveSaleSort } = require("../utils/salesQuery");
const invoiceService = require("../services/invoiceService");
const { computeSaleTotals, computeReturnSettlement, computeReplacementCredit, round2 } = require("../utils/saleMath");
const ReturnRecord = require("../models/ReturnRecord");
const { clampLimit, clampPage, posInt, pageMeta } = require("../utils/validate");

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Restock + adjust sale + credit ledger for a return. Returns refund + line snapshots.
async function processReturn(sale, reqItems, ownerId) {
  let refundTotal = 0;
  const returnedItems = [];
  for (const r of reqItems) {
    const qty = posInt(r.quantity);
    if (qty <= 0) continue;
    const line = sale.items.find((it) => String(it.product) === String(r.productId));
    if (!line) throw httpError(400, "Returned item is not part of this sale");
    const returnable = (line.quantity || 0) - (line.returnedQty || 0);
    if (qty > returnable) throw httpError(400, `Cannot return ${qty} of ${line.name} — only ${returnable} returnable`);
    const netUnit = line.quantity > 0 ? (line.subtotal || 0) / line.quantity : 0;
    const refund = Math.round(netUnit * qty * 100) / 100;
    refundTotal += refund;
    line.returnedQty = (line.returnedQty || 0) + qty;
    returnedItems.push({ product: line.product, name: line.name, quantity: qty, unitNet: Math.round(netUnit * 100) / 100, refund });
    const product = await Product.findOne({ _id: line.product, owner: ownerId });
    if (product) {
      product.stock += qty;
      product.soldCount = Math.max(0, (product.soldCount || 0) - qty);
      await product.save();
    }
  }
  refundTotal = Math.round(refundTotal * 100) / 100;
  if (refundTotal <= 0) throw httpError(400, "Nothing to return");

  // Money settlement: split the refund into "due cancelled" vs "cash refunded"
  // so COLLECTED drops by the cash portion and the ledger only credits the
  // outstanding portion (fixes walk-in + registered return accuracy).
  const s = computeReturnSettlement(sale, refundTotal);
  sale.returnedAmount = s.newReturnedAmount;
  sale.payments = s.newPayments;
  sale.amountPaid = s.newAmountPaid;
  sale.dueAmount = s.newDueAmount;
  sale.paymentStatus = s.paymentStatus;
  sale.paymentMethod = s.newPayments.length > 1 ? "split" : s.newPayments.length === 1 ? s.newPayments[0].method : sale.paymentMethod;
  const totalQty = sale.items.reduce((a, it) => a + (it.quantity || 0), 0);
  const returnedQ = sale.items.reduce((a, it) => a + (it.returnedQty || 0), 0);
  sale.returnStatus = returnedQ === 0 ? "none" : returnedQ >= totalQty ? "full" : "partial";
  await sale.save();

  if (sale.customer) {
    const customer = await Customer.findById(sale.customer);
    if (customer) {
      customer.pendingBalance = Math.round(Math.max(0, (customer.pendingBalance || 0) - s.dueReduction) * 100) / 100;
      customer.totalPurchased = Math.round(Math.max(0, (customer.totalPurchased || 0) - refundTotal) * 100) / 100;
      customer.totalPaid = Math.round(Math.max(0, (customer.totalPaid || 0) - s.cashRefund) * 100) / 100;
      await customer.save();
      // Ledger reflects the BALANCE change only (the due cancelled). A pure cash
      // refund (dueReduction === 0) doesn't change the balance, so skip the row.
      if (s.dueReduction > 0) {
        await LedgerEntry.create({
          owner: ownerId,
          customer: customer._id,
          type: "return",
          amount: -s.dueReduction,
          balanceAfter: customer.pendingBalance,
          reference: sale._id,
          note: `Return on ${sale.invoiceNumber}${s.cashRefund > 0 ? ` (₹${s.cashRefund} cash refund)` : ""}`,
        });
      }
    }
  }
  return { refundTotal, returnedItems, cashRefund: s.cashRefund, dueReduction: s.dueReduction };
}

// Create a sale from resolved line items (used by replacement). Mirrors POST /sales create.
async function createSaleFromItems({ ownerId, customer, customerName, customerType, items, payments = [], billDiscount = {}, replacementOf = null, carryCredit = 0, user }) {
  const rawItems = [];
  for (const it of items) {
    const product = await Product.findOne({ _id: it.productId, owner: ownerId });
    if (!product) throw httpError(404, `Product not found: ${it.productId}`);
    const qty = posInt(it.quantity);
    if (qty <= 0) throw httpError(400, `Invalid quantity for ${product.name}`);
    if (product.stock < qty) throw httpError(400, `Insufficient stock for ${product.name} (have ${product.stock}, need ${qty})`);
    rawItems.push({
      product: product._id,
      name: product.name,
      size: product.size,
      color: product.color,
      quantity: qty,
      unitPrice: Number(it.unitPrice ?? product.sellingPrice),
      costPrice: Number(product.costPrice) || 0,
      discountType: it.discountType === "percent" ? "percent" : "amount",
      discountValue: Number(it.discountValue) || 0,
    });
  }
  const computed = computeSaleTotals({ items: rawItems, billDiscount });
  // Replacement carry-over: apply already-paid value from the returned sale as a
  // "credit" payment so a cash-neutral swap never leaves the customer wrongly owing.
  const extraPaid = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const { carriedCredit } = computeReplacementCredit({ cashRefund: carryCredit, replacementTotal: computed.total, extraPaid });
  const effPayments = carriedCredit > 0 ? [...payments, { method: "credit", amount: carriedCredit }] : payments;
  const paid = Math.min(effPayments.reduce((a, p) => a + (Number(p.amount) || 0), 0), computed.total);
  const due = Math.round((computed.total - paid) * 100) / 100;
  const summaryMethod = effPayments.length > 1 ? "split" : effPayments.length === 1 ? effPayments[0].method : "cash";
  const invoiceNumber = await invoiceService.nextInvoiceNumber(ownerId);
  const sale = await Sale.create({
    owner: ownerId,
    customer: customer ? customer._id : null,
    customerName,
    customerType,
    items: computed.items,
    subtotal: computed.subtotal,
    itemDiscountTotal: computed.itemDiscountTotal,
    billDiscountType: computed.billDiscountType,
    billDiscountValue: computed.billDiscountValue,
    billDiscountAmount: computed.billDiscountAmount,
    totalDiscount: computed.totalDiscount,
    total: computed.total,
    payments: effPayments,
    amountPaid: paid,
    dueAmount: due,
    paymentMethod: summaryMethod,
    paymentStatus: due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
    invoiceNumber,
    replacementOf,
  });
  for (const it of computed.items) {
    await Product.updateOne({ _id: it.product, owner: ownerId }, { $inc: { stock: -it.quantity, soldCount: it.quantity } });
  }
  if (customer) {
    customer.pendingBalance += due;
    customer.totalPurchased += computed.total;
    customer.totalPaid += paid;
    customer.lastPurchaseAt = new Date();
    await customer.save();
    await LedgerEntry.create({ owner: ownerId, customer: customer._id, type: "sale", amount: computed.total, balanceAfter: customer.pendingBalance, reference: sale._id, note: `Replacement ${sale.invoiceNumber}` });
    if (paid > 0) await LedgerEntry.create({ owner: ownerId, customer: customer._id, type: "payment", amount: -paid, balanceAfter: customer.pendingBalance, reference: sale._id, note: `Payment for ${sale.invoiceNumber} (${summaryMethod})` });
  }
  return { sale, total: computed.total, paid };
}

const router = express.Router();
router.use(protect);

// Normalize the split-payment array; tolerate the legacy { amountPaid, paymentMethod } shape.
function normalizePayments(body) {
  let payments = [];
  if (Array.isArray(body.payments)) {
    payments = body.payments
      .map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }))
      .filter((p) => p.amount > 0 && p.method);
  } else if (body.amountPaid != null) {
    const amt = Number(body.amountPaid) || 0;
    if (amt > 0) payments = [{ method: body.paymentMethod || "cash", amount: amt }];
  }
  const amountPaid = payments.reduce((a, p) => a + p.amount, 0);
  const summaryMethod =
    payments.length > 1 ? "split" : payments.length === 1 ? payments[0].method : "cash";
  return { payments, amountPaid, summaryMethod };
}

// GET /api/sales — optional filters (all backward compatible; no params = latest 200)
//   q          customer name contains
//   status     paid | partial | unpaid
//   customerId filter to one customer
//   from, to   ISO dates (inclusive day range on createdAt)
//   sort       latest (default) | oldest | highest | lowest
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, status, customerId, from, to, sort } = req.query;
    const filter = buildSalesFilter({ ownerId: req.user._id, q, status, customerId, from, to });
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 25, 100);
    const [sales, total] = await Promise.all([
      Sale.find(filter).sort(resolveSaleSort(sort)).skip((page - 1) * limit).limit(limit),
      Sale.countDocuments(filter),
    ]);
    res.json({ sales, ...pageMeta(total, page, limit) });
  })
);

// GET /api/sales/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    res.json({ sale });
  })
);

// POST /api/sales
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { items, notes = "" } = req.body;
    const customerType = req.body.customerType || "existing";
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400);
      throw new Error("At least one item is required");
    }

    // --- Resolve customer based on type ---
    let customer = null;
    let customerName = "Walk-in Customer";

    if (customerType === "walkin") {
      customer = null;
      customerName = req.body.walkInName?.trim() || "Walk-in Customer";
    } else if (customerType === "new") {
      const nc = req.body.newCustomer || {};
      if (!nc.name || !nc.phone) {
        res.status(400);
        throw new Error("New customer needs a name and phone");
      }
      // Reuse an existing customer with the same phone if present, else create.
      customer = await Customer.findOne({ owner: req.user._id, phone: nc.phone });
      if (!customer) {
        customer = await Customer.create({
          owner: req.user._id,
          name: nc.name,
          phone: nc.phone,
          shopName: nc.shopName || "",
        });
      }
      customerName = customer.name;
    } else {
      // existing
      customer = await Customer.findOne({ _id: req.body.customerId, owner: req.user._id });
      if (!customer) {
        res.status(404);
        throw new Error("Customer not found");
      }
      customerName = customer.name;
    }

    // --- Build snapshot items + validate stock ---
    const rawItems = [];
    for (const it of items) {
      const product = await Product.findOne({ _id: it.productId, owner: req.user._id });
      if (!product) {
        res.status(404);
        throw new Error(`Product not found: ${it.productId}`);
      }
      const qty = Number(it.quantity || 0);
      if (qty <= 0) {
        res.status(400);
        throw new Error(`Invalid quantity for product ${product.name}`);
      }
      if (product.stock < qty) {
        res.status(400);
        throw new Error(`Insufficient stock for ${product.name} (have ${product.stock}, need ${qty})`);
      }
      rawItems.push({
        product: product._id,
        name: product.name,
        size: product.size,
        color: product.color,
        quantity: qty,
        unitPrice: Number(it.unitPrice ?? product.sellingPrice),
        costPrice: Number(product.costPrice) || 0, // snapshot for profit engine
        discountType: it.discountType === "percent" ? "percent" : "amount",
        discountValue: Number(it.discountValue) || 0,
      });
    }

    // --- Discount engine: item + bill discounts -> final totals ---
    const computed = computeSaleTotals({ items: rawItems, billDiscount: req.body.billDiscount });
    const expandedItems = computed.items;
    const total = computed.total;

    // --- Payments ---
    const { payments, amountPaid, summaryMethod } = normalizePayments(req.body);
    const paid = Math.min(amountPaid, total);
    const due = Number((total - paid).toFixed(2));
    const paymentStatus = due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";

    // Walk-ins create no ledger, so they cannot carry a due balance.
    if (customerType === "walkin" && due > 0) {
      res.status(400);
      throw new Error("Walk-in sales must be fully paid (no ledger to track a balance).");
    }

    // --- Persist sale (sequential BZR-YYYY-###### invoice number) ---
    const invoiceNumber = await invoiceService.nextInvoiceNumber(req.user._id);
    const sale = await Sale.create({
      owner: req.user._id,
      customer: customer ? customer._id : null,
      customerName,
      customerType,
      items: expandedItems,
      subtotal: computed.subtotal,
      itemDiscountTotal: computed.itemDiscountTotal,
      billDiscountType: computed.billDiscountType,
      billDiscountValue: computed.billDiscountValue,
      billDiscountAmount: computed.billDiscountAmount,
      totalDiscount: computed.totalDiscount,
      total,
      payments,
      amountPaid: paid,
      dueAmount: due,
      paymentMethod: summaryMethod,
      paymentStatus,
      invoiceNumber,
      notes,
    });

    // --- Decrement stock + soldCount (always) ---
    for (const it of expandedItems) {
      await Product.updateOne(
        { _id: it.product, owner: req.user._id },
        { $inc: { stock: -it.quantity, soldCount: it.quantity } }
      );
    }

    // --- Ledger + customer balance (skip for walk-ins) ---
    if (customer) {
      customer.pendingBalance += due;
      customer.totalPurchased += total;
      customer.totalPaid += paid;
      customer.lastPurchaseAt = new Date();
      await customer.save();

      await LedgerEntry.create({
        owner: req.user._id,
        customer: customer._id,
        type: "sale",
        amount: total,
        balanceAfter: customer.pendingBalance,
        reference: sale._id,
        note: `Sale ${sale.invoiceNumber}`,
      });
      if (paid > 0) {
        await LedgerEntry.create({
          owner: req.user._id,
          customer: customer._id,
          type: "payment",
          amount: -paid,
          balanceAfter: customer.pendingBalance,
          reference: sale._id,
          note: `Payment for ${sale.invoiceNumber} (${summaryMethod})`,
        });
      }
    }

    // --- WhatsApp invoice (only when we have a customer with a phone) ---
    let whatsappResult = null;
    if (customer && req.user.preferences?.whatsappAutoInvoice !== false) {
      whatsappResult = await whatsapp.sendInvoice({
        owner: req.user._id,
        customer,
        sale,
        businessName: req.user.business?.name,
        upiQr: req.user.business?.upiQr,
      });
    }

    res.status(201).json({ sale, whatsapp: whatsappResult });
  })
);

// GET /api/sales/:id/invoice — invoice data (used by the on-screen invoice view)
router.get(
  "/:id/invoice",
  asyncHandler(async (req, res) => {
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    let customerPhone = "";
    if (sale.customer) {
      const c = await Customer.findById(sale.customer);
      customerPhone = c?.phone || "";
    }
    res.json({
      invoice: {
        saleId: sale._id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.createdAt,
        business: req.user.business,
        customer: sale.customerName,
        customerId: sale.customer,
        customerPhone,
        customerType: sale.customerType,
        items: sale.items,
        subtotal: sale.subtotal || sale.total, // legacy sales: subtotal == total
        itemDiscountTotal: sale.itemDiscountTotal || 0,
        billDiscountAmount: sale.billDiscountAmount || 0,
        totalDiscount: sale.totalDiscount || 0,
        total: sale.total,
        returnedAmount: sale.returnedAmount || 0,
        netTotal: round2((sale.total || 0) - (sale.returnedAmount || 0)),
        returnStatus: sale.returnStatus || "none",
        payments: sale.payments,
        amountPaid: sale.amountPaid,
        dueAmount: sale.dueAmount,
        paymentStatus: sale.paymentStatus,
        paymentMethod: sale.paymentMethod,
      },
    });
  })
);

// POST /api/sales/:id/return — Returns v2: restock + ledger credit + audit trail.
// Body: { items: [{ productId, quantity }], reason, notes }
router.post(
  "/:id/return",
  asyncHandler(async (req, res) => {
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    const reqItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (reqItems.length === 0) {
      res.status(400);
      throw new Error("Select at least one item to return");
    }
    const { refundTotal, returnedItems } = await processReturn(sale, reqItems, req.user._id);
    const record = await ReturnRecord.create({
      owner: req.user._id,
      sale: sale._id,
      customer: sale.customer,
      invoiceNumber: sale.invoiceNumber,
      type: "return",
      items: returnedItems,
      refundAmount: refundTotal,
      reason: String(req.body.reason || "").slice(0, 200),
      notes: String(req.body.notes || "").slice(0, 500),
    });
    res.json({ ok: true, refund: refundTotal, sale, record });
  })
);

// POST /api/sales/:id/replace — Replacement v1 = return old items + new sale, settle difference.
// Body: { returnItems:[{productId,quantity}], newItems:[{productId,quantity,...}], payments:[], billDiscount, reason, notes }
router.post(
  "/:id/replace",
  asyncHandler(async (req, res) => {
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    const returnItems = Array.isArray(req.body.returnItems) ? req.body.returnItems : [];
    const newItems = Array.isArray(req.body.newItems) ? req.body.newItems : [];
    if (returnItems.length === 0 || newItems.length === 0) {
      res.status(400);
      throw new Error("Replacement needs both items to return and replacement items");
    }
    if (sale.customerType === "walkin") {
      res.status(400);
      throw new Error("Replacement is not available for walk-in sales");
    }

    // 1) Return the old items. cashRefund = already-paid value freed up by the return.
    const { refundTotal, returnedItems, cashRefund } = await processReturn(sale, returnItems, req.user._id);

    // 2) Create the replacement sale, carrying the freed-up cash as credit so the swap
    //    is cash-neutral (customer only settles a positive difference; lower swaps refund
    //    the excess). debits ledger by its total + records payment/credit.
    const customer = sale.customer ? await Customer.findById(sale.customer) : null;
    const payments = (Array.isArray(req.body.payments) ? req.body.payments : [])
      .map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }))
      .filter((p) => p.amount > 0 && p.method);
    const { sale: newSale, total: replacementAmount } = await createSaleFromItems({
      ownerId: req.user._id,
      customer,
      customerName: sale.customerName,
      customerType: customer ? "existing" : "walkin",
      items: newItems,
      payments,
      billDiscount: req.body.billDiscount,
      replacementOf: sale._id,
      carryCredit: cashRefund,
      user: req.user,
    });

    const priceDifference = Math.round((replacementAmount - refundTotal) * 100) / 100;
    const record = await ReturnRecord.create({
      owner: req.user._id,
      sale: sale._id,
      customer: sale.customer,
      invoiceNumber: sale.invoiceNumber,
      type: "replacement",
      items: returnedItems,
      refundAmount: refundTotal,
      replacementSale: newSale._id,
      replacementAmount,
      priceDifference,
      reason: String(req.body.reason || "").slice(0, 200),
      notes: String(req.body.notes || "").slice(0, 500),
    });
    res.json({ ok: true, refund: refundTotal, replacementAmount, priceDifference, sale, newSale, record });
  })
);

// GET /api/sales/:id/returns — linked return + replacement history for a sale
router.get(
  "/:id/returns",
  asyncHandler(async (req, res) => {
    const records = await ReturnRecord.find({ owner: req.user._id, sale: req.params.id }).sort({ createdAt: 1 });
    res.json({ records });
  })
);

// GET /api/sales/:id/invoice/pdf — downloadable branded PDF invoice
router.get(
  "/:id/invoice/pdf",
  asyncHandler(async (req, res) => {
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    let customer = {};
    if (sale.customer) customer = (await Customer.findById(sale.customer)) || {};
    const pdf = await buildInvoicePdf(sale, req.user.business || {}, customer);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${sale.invoiceNumber}.pdf"`);
    res.send(pdf);
  })
);

// POST /api/sales/:id/invoice/whatsapp — (re)send invoice summary + PDF document on WhatsApp
router.post(
  "/:id/invoice/whatsapp",
  asyncHandler(async (req, res) => {
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    if (!sale.customer) {
      res.status(400);
      throw new Error("Walk-in sales have no customer to message");
    }
    const customer = await Customer.findById(sale.customer);
    if (!customer || !customer.phone) {
      res.status(400);
      throw new Error("Customer has no phone number on file");
    }
    const pdfBuffer = await buildInvoicePdf(sale, req.user.business || {}, customer);
    const result = await whatsapp.sendInvoice({
      owner: req.user._id,
      customer,
      sale,
      businessName: req.user.business?.name,
      upiQr: req.user.business?.upiQr,
      pdfBuffer,
    });
    res.json({ ok: result.status === "sent", whatsapp: result });
  })
);

module.exports = router;
