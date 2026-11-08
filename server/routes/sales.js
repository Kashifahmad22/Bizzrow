const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const Customer = require("../models/Customer");
const LedgerEntry = require("../models/LedgerEntry");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { customerId: validateCustomerId, customerPhone } = require("../utils/customerInput");
const whatsapp = require("../services/whatsappService");
const { buildInvoicePdf } = require("../services/pdfService");
const { snapshotInvoiceTerms } = require("../utils/invoiceTerms");
const { buildSalesFilter, resolveSaleSort } = require("../utils/salesQuery");
const invoiceService = require("../services/invoiceService");
const {
  allocateReturnItems,
  computeSaleTotals,
  computeReturnSettlement,
  computeReplacementCredit,
  normalizePaymentSplits,
  normalizeCheckoutPayments,
  paymentPaise,
  validateExpectedTotal,
  validateReviewedItems,
  round2,
} = require("../utils/saleMath");
const ReturnRecord = require("../models/ReturnRecord");
const { clampLimit, clampPage, pageMeta } = require("../utils/validate");
const quantityMath = require("../utils/quantity");
const { decrementStock, getStockRequirements } = require("../services/stockService");
const { restoreBatchStock, returnedBatchAllocations } = require("../services/stockBatchService");
const { salePrice, initialSalePrice, wholesalePrice, retailPrice } = require("../utils/productPricing");
const {
  executeIdempotently,
  requestFingerprint,
  requireIdempotencyKey,
  resourceIdempotency,
} = require("../services/financialTransaction");

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function validatePriceInputs(items, billDiscount) {
  const validate = (value, label) => {
    try {
      paymentPaise(value);
    } catch (error) {
      throw httpError(400, `${label} must be a non-negative amount with at most two decimal places`);
    }
  };
  for (const item of items) {
    if (item.unitPrice != null) validate(item.unitPrice, "Unit price");
    if (item.discountValue != null && item.discountType !== "percent") validate(item.discountValue, "Item discount");
  }
  if (billDiscount?.value != null && billDiscount.type !== "percent") validate(billDiscount.value, "Bill discount");
}

function validateProductPrice(price, name) {
  try {
    paymentPaise(price);
  } catch (error) {
    throw httpError(409, `Price for ${name} is invalid or has more than two decimal places. Update the product price before selling.`);
  }
}

function cashRefundParts(paymentParts, refundAmount) {
  let remaining = refundAmount;
  const refunds = [];
  for (const payment of paymentParts) {
    if (remaining <= 0) break;
    const amount = round2(Math.min(payment.amount, remaining));
    if (amount > 0) {
      refunds.push({ method: "cash", amount, source: payment.source || "sale" });
      remaining = round2(remaining - amount);
    }
  }
  if (remaining > 0) throw httpError(500, "Cash refund could not be reconciled to returned payments");
  return refunds;
}

// Restock + adjust sale + customer/ledger balances for a return atomically.
async function processReturn(sale, reqItems, ownerId, session, { replacement = false } = {}) {
  const quantityReconciliations = [];
  for (const item of sale.items) {
    try {
      quantityMath.subtract(item.quantity, item.returnedQty || 0);
    } catch (error) {
      if (error.status !== 409) throw error;
      const productId = String(item.product);
      if (sale.items.filter((line) => String(line.product) === productId).length !== 1) {
        throw httpError(409, "Historical return quantity is ambiguous; reconcile the sale before returning it");
      }
      const history = await ReturnRecord.find({ owner: ownerId, sale: sale._id })
        .sort({ createdAt: 1, _id: 1 }).session(session);
      const quantities = history.flatMap((record) => record.items
        .filter((entry) => String(entry.product) === productId)
        .map((entry) => entry.quantity));
      let verified = 0;
      let binary = 0;
      try {
        for (const quantity of quantities) {
          if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Invalid return history");
          verified = quantityMath.add(verified, quantity);
          binary += quantity;
        }
        quantityMath.subtract(item.quantity, verified);
      } catch {
        throw httpError(409, "Historical return quantities cannot be reconciled safely; review the sale and inventory");
      }
      if (quantities.length < 2 || binary !== item.returnedQty || verified === item.returnedQty
          || verified < 0 || verified > item.quantity) {
        throw httpError(409, "Historical return quantities cannot be verified from return records; reconcile the sale and inventory");
      }
      quantityReconciliations.push({ product: item.product, storedReturnedQty: item.returnedQty, verifiedReturnedQty: verified });
      item.returnedQty = verified;
    }
  }
  let allocations;
  try {
    allocations = allocateReturnItems(sale, reqItems);
  } catch (error) {
    if (!error.status) error.status = 400;
    throw error;
  }
  const returnedItems = [];
  const refundTotal = round2(allocations.reduce((sum, item) => sum + item.refund, 0));
  if (!allocations.length) throw httpError(400, "Nothing to return");

  for (const allocation of allocations) {
    const { item, quantity, refund, newReturnedQty } = allocation;
    const restoredBatchAllocations = returnedBatchAllocations(item, quantity);
    item.returnedQty = newReturnedQty;
    returnedItems.push({
      product: item.product,
      name: item.name,
      quantity,
      unitNet: round2(refund / quantity),
      refund,
    });
    const product = await Product.findOne({ _id: item.product, owner: ownerId }).session(session);
    if (!product) throw httpError(409, `Cannot return ${item.name}; its product record is unavailable`);
    const stockUpdate = await Product.updateOne(
      { _id: item.product, owner: ownerId, stock: product.stock },
      { $set: {
        stock: quantityMath.add(product.stock, quantity),
        soldCount: Math.max(0, quantityMath.subtract(product.soldCount || 0, quantity)),
      }, $inc: { stockRevision: 1 } },
      { session }
    );
    if (stockUpdate.matchedCount !== 1) {
      throw httpError(409, `Cannot return ${item.name}; its product record is unavailable`);
    }
    try {
      await restoreBatchStock({
        StockBatch,
        ownerId,
        productId: item.product,
        allocations: restoredBatchAllocations.allocations,
        session,
      });
    } catch (error) {
      error.message = `${error.message} for ${item.name}`;
      throw error;
    }
  }

  let s;
  try {
    s = computeReturnSettlement(sale, refundTotal);
  } catch (error) {
    error.status = 409;
    throw error;
  }
  sale.returnedAmount = s.newReturnedAmount;
  sale.payments = s.newPayments;
  sale.amountPaid = s.newAmountPaid;
  sale.creditApplied = s.newCreditApplied;
  sale.dueAmount = s.newDueAmount;
  sale.paymentStatus = s.paymentStatus;
  sale.paymentMethod = s.newCreditApplied > 0
    ? s.newPayments.length > 0 ? "split" : "credit"
    : s.newPayments.length > 1 ? "split"
      : s.newPayments.length === 1 ? s.newPayments[0].method : sale.paymentMethod;
  const anyReturned = sale.items.some((item) => (item.returnedQty || 0) > 0);
  const allReturned = sale.items.every((item) => (item.returnedQty || 0) >= item.quantity);
  sale.returnStatus = !anyReturned ? "none" : allReturned ? "full" : "partial";
  await sale.save({ session });

  if (sale.customer) {
    const customer = await Customer.findOne({ _id: sale.customer, owner: ownerId }).session(session);
    if (!customer) throw httpError(409, "Cannot return this sale because its customer record is missing");
    const customerBalance = round2(customer.pendingBalance || 0);
    if (s.dueReduction > customerBalance) {
      throw httpError(409, "Customer balance is inconsistent with this sale's outstanding amount");
    }
    customer.pendingBalance = round2(customerBalance - s.dueReduction);
    customer.totalPurchased = Math.round(Math.max(0, (customer.totalPurchased || 0) - refundTotal) * 100) / 100;
    customer.totalPaid = Math.round(Math.max(0, (customer.totalPaid || 0) - s.paidRefund) * 100) / 100;
    await customer.save({ session });
    if (s.dueReduction > 0 || s.paidRefund > 0 || s.creditRefund > 0) {
      await LedgerEntry.create([{
        owner: ownerId,
        customer: customer._id,
        type: "return",
        amount: s.dueReduction > 0 ? -s.dueReduction : 0,
        balanceAfter: customer.pendingBalance,
        reference: sale._id,
        note: `Return on ${sale.invoiceNumber}; ${replacement ? "payment released for replacement settlement" : "payment refunded"}: ${s.paidRefund.toFixed(2)}; prior credit refunded: ${s.creditRefund.toFixed(2)}`,
      }], { session });
    }
  }
  const cashRefund = replacement ? s.creditRefund : round2(s.paidRefund + s.creditRefund);
  const refundPayments = replacement
    ? (s.creditRefund > 0 ? [{ method: "cash", amount: s.creditRefund, source: "credit" }] : [])
    : [...s.paidRefundPayments, ...(s.creditRefund > 0 ? [{ method: "cash", amount: s.creditRefund, source: "credit" }] : [])];
  return {
    quantityReconciliations,
    refundTotal,
    returnedItems,
    cashRefund,
    creditToReplacement: replacement ? s.paidRefund : 0,
    dueReduction: s.dueReduction,
    paidRefund: s.paidRefund,
    paidRefundPayments: s.paidRefundPayments,
    creditRefund: s.creditRefund,
    refundPayments,
  };
}

// Create a replacement sale with credit recorded separately from collected payments.
async function createSaleFromItems({ ownerId, customer, customerName, customerType, items, payments = [], billDiscount = {}, saleType = "wholesale", replacementOf = null, carryCredit = 0, business = {}, session }) {
  validatePriceInputs(items, billDiscount);
  const rawItems = [];
  for (const it of items) {
    const product = await Product.findOne({ _id: it.productId, owner: ownerId }).session(session);
    if (!product) throw httpError(404, `Product not found: ${it.productId}`);
    const qty = quantityMath.validateNewQuantity(it.quantity);
    validateProductPrice(salePrice(product, saleType), product.name);
    rawItems.push({
      product: product._id,
      name: product.name,
      sku: product.sku || "",
      unit: product.unit || "",
      size: product.size,
      color: product.color,
      quantity: qty,
      unitPrice: salePrice(product, saleType),
      wholesalePrice: wholesalePrice(product),
      retailPrice: retailPrice(product),
      costPrice: product.costPrice == null ? null : Number(product.costPrice),
      discountType: it.discountType === "percent" ? "percent" : "amount",
      discountValue: Number(it.discountValue) || 0,
    });
  }
  const computed = computeSaleTotals({ items: rawItems, billDiscount });
  let normalizedPayments;
  try {
    normalizedPayments = normalizePaymentSplits(payments, computed.total);
  } catch (error) {
    error.status = 400;
    throw error;
  }
  const extraPaid = normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const { carriedCredit, cashReturned } = computeReplacementCredit({
    cashRefund: carryCredit,
    replacementTotal: computed.total,
    extraPaid,
  });
  const paid = round2(extraPaid);
  const due = round2(computed.total - paid - carriedCredit);
  const summaryMethod = carriedCredit > 0 && normalizedPayments.length > 0
    ? "split"
    : carriedCredit > 0 ? "credit"
      : normalizedPayments.length > 1 ? "split"
        : normalizedPayments.length === 1 ? normalizedPayments[0].method : "cash";
  const invoiceNumber = await invoiceService.nextInvoiceNumber(ownerId, new Date(), session);
  const collectedAt = new Date();
  await decrementStock({ Product, StockBatch, items: computed.items, ownerId, session });
  const [sale] = await Sale.create([{
    owner: ownerId,
    customer: customer ? customer._id : null,
    customerName,
    customerPhoneSnapshot: customer?.phone || "",
    customerShopNameSnapshot: customer?.shopName || "",
    customerAddressSnapshot: customer?.address || "",
    customerGstNumberSnapshot: customer?.gstNumber || "",
    customerType,
    saleType,
    items: computed.items,
    subtotal: computed.subtotal,
    itemDiscountTotal: computed.itemDiscountTotal,
    billDiscountType: computed.billDiscountType,
    billDiscountValue: computed.billDiscountValue,
    billDiscountAmount: computed.billDiscountAmount,
    totalDiscount: computed.totalDiscount,
    total: computed.total,
    payments: normalizedPayments.map((payment) => ({ ...payment, source: "sale", collectedAt })),
    collectionPayments: normalizedPayments.map((payment) => ({ ...payment, source: "sale", collectedAt })),
    amountPaid: paid,
    creditApplied: carriedCredit,
    creditSources: carriedCredit > 0 && replacementOf ? [{ sale: replacementOf, amount: carriedCredit }] : [],
    dueAmount: due,
    paymentMethod: summaryMethod,
    paymentStatus: due === 0 ? "paid" : paid + carriedCredit > 0 ? "partial" : "unpaid",
    invoiceNumber,
    ...snapshotInvoiceTerms(business),
    replacementOf,
  }], { session });
  if (customer) {
    const previousBalance = customer.pendingBalance || 0;
    customer.pendingBalance = round2(previousBalance + due);
    customer.totalPurchased = round2((customer.totalPurchased || 0) + computed.total);
    customer.totalPaid = round2((customer.totalPaid || 0) + paid);
    customer.lastPurchaseAt = new Date();
    await customer.save({ session });
    const entries = [{
      owner: ownerId,
      customer: customer._id,
      type: "sale",
      amount: computed.total,
      balanceAfter: round2(previousBalance + computed.total),
      reference: sale._id,
      note: `Replacement ${sale.invoiceNumber}`,
    }];
    if (paid > 0) entries.push({
      owner: ownerId,
      customer: customer._id,
      type: "payment",
      amount: -paid,
      balanceAfter: round2(previousBalance + computed.total - paid),
      reference: sale._id,
      collectionSource: "sale",
      paymentMethod: normalizedPayments.length > 1 ? "split" : normalizedPayments[0].method,
      note: `Payment for ${sale.invoiceNumber}`,
    });
    if (carriedCredit > 0) entries.push({
      owner: ownerId,
      customer: customer._id,
      type: "adjustment",
      amount: -carriedCredit,
      balanceAfter: customer.pendingBalance,
      reference: sale._id,
      collectionSource: "credit",
      note: `Replacement credit applied to ${sale.invoiceNumber}`,
    });
    await LedgerEntry.create(entries, { session, ordered: true });
  }
  return { sale, total: computed.total, paid, carriedCredit, cashReturned };
}

const router = express.Router();
router.use(protect);

// Normalize split tender while retaining the legacy { amountPaid, paymentMethod } shape.
function normalizePayments(body, maximum) {
  try {
    return normalizeCheckoutPayments(body, maximum);
  } catch (error) {
    error.status = 400;
    throw error;
  }
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
    const filter = buildSalesFilter({ ownerId: req.user._id, q, status, customerId: customerId == null ? undefined : validateCustomerId(customerId), from, to });
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
    const key = requireIdempotencyKey(req);
    const fingerprint = requestFingerprint("sale:create", {}, req.body);
    const result = await executeIdempotently({
      ownerId: req.user._id,
      operation: "sale-create",
      key,
      fingerprint,
      prepare: async (session) => {
        const { items, notes = "" } = req.body;
        const customerType = req.body.customerType || "existing";
        const saleType = req.body.saleType || "wholesale";
        if (!["wholesale", "retail"].includes(saleType)) {
          throw httpError(400, "Sale type must be wholesale or retail");
        }
        if (!Array.isArray(items) || items.length === 0) {
          throw httpError(400, "At least one item is required");
        }
        validatePriceInputs(items, req.body.billDiscount);
        if (Object.prototype.hasOwnProperty.call(req.body, "reviewedItems")) {
          validateReviewedItems(req.body, items.map((item) => ({
            product: item?.productId,
            quantity: Number(item?.quantity),
          })), { checkPrices: false });
        }

        let customer = null;
        let newCustomer = null;
        let customerName = "Walk-in Customer";
        if (customerType === "walkin") {
          customerName = req.body.walkInName?.trim() || "Walk-in Customer";
        } else if (customerType === "new") {
          const nc = req.body.newCustomer || {};
          if (!nc.name || !nc.phone) throw httpError(400, "New customer needs a name and phone");
          const phone = customerPhone(nc.phone);
          customer = await Customer.findOne({ owner: req.user._id, phone }).session(session);
          if (!customer) {
            newCustomer = {
              owner: req.user._id,
              name: nc.name,
              phone,
              shopName: nc.shopName || "",
              address: nc.address || "",
              gstNumber: nc.gstNumber || "",
            };
          }
          customerName = customer ? customer.name : nc.name;
        } else if (customerType === "existing") {
          customer = await Customer.findOne({ _id: validateCustomerId(req.body.customerId), owner: req.user._id }).session(session);
          if (!customer) throw httpError(404, "Customer not found");
          customerName = customer.name;
        } else {
          throw httpError(400, "Invalid customer type");
        }

        const rawItems = [];
        const products = new Map();
        for (const item of items) {
          const productId = String(item.productId || "").toLowerCase();
          let product = products.get(productId);
          if (!product) {
            product = await Product.findOne({ _id: productId, owner: req.user._id }).session(session);
            if (!product) throw httpError(404, `Product not found: ${item.productId}`);
            products.set(productId, product);
          }
          const quantity = quantityMath.validateNewQuantity(item.quantity);
          const unitPrice = initialSalePrice(product, saleType, item, req.body);
          validateProductPrice(unitPrice, product.name);
          rawItems.push({
            product: product._id,
            name: product.name,
            sku: product.sku || "",
            unit: product.unit || "",
            size: product.size,
            color: product.color,
            wholesalePrice: wholesalePrice(product),
            retailPrice: retailPrice(product),
            quantity,
            unitPrice,
            costPrice: product.costPrice == null ? null : Number(product.costPrice),
            discountType: item.discountType === "percent" ? "percent" : "amount",
            discountValue: Number(item.discountValue) || 0,
          });
        }

        const computed = computeSaleTotals({ items: rawItems, billDiscount: req.body.billDiscount });
        validateReviewedItems(req.body, computed.items);
        validateExpectedTotal(req.body, computed.total);

        for (const [productId, quantity] of getStockRequirements(rawItems)) {
          const product = products.get(productId);
          if (product.stock < quantity) {
            throw httpError(400, `Insufficient stock for ${product.name} (have ${product.stock}, need ${quantity})`);
          }
        }

        const { payments, amountPaid: paid, dueAmount: due, summaryMethod, cashTendered, cashChange } = normalizePayments(req.body, computed.total);
        if (customerType === "walkin" && due > 0) {
          throw httpError(400, "Walk-in sales must be fully paid (no ledger to track a balance).");
        }
        const paymentStatus = due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
        return { notes, customerType, saleType, customer, newCustomer, customerName, computed, payments, paid, due, summaryMethod, cashTendered, cashChange, paymentStatus };
      },
      work: async (session, prepared) => {
        let { customer } = prepared;
        const { notes, customerType, saleType, newCustomer, customerName, computed, payments, paid, due, summaryMethod, cashTendered, cashChange, paymentStatus } = prepared;
        if (newCustomer) [customer] = await Customer.create([newCustomer], { session });
        const invoiceNumber = await invoiceService.nextInvoiceNumber(req.user._id, new Date(), session);
        const collectedAt = new Date();
        await decrementStock({ Product, StockBatch, items: computed.items, ownerId: req.user._id, session });
        const [sale] = await Sale.create([{
          owner: req.user._id,
          customer: customer ? customer._id : null,
          customerName,
          customerPhoneSnapshot: customer?.phone || "",
          customerShopNameSnapshot: customer?.shopName || "",
          customerAddressSnapshot: customer?.address || "",
          customerGstNumberSnapshot: customer?.gstNumber || "",
          customerType,
          saleType,
          items: computed.items,
          subtotal: computed.subtotal,
          itemDiscountTotal: computed.itemDiscountTotal,
          billDiscountType: computed.billDiscountType,
          billDiscountValue: computed.billDiscountValue,
          billDiscountAmount: computed.billDiscountAmount,
          totalDiscount: computed.totalDiscount,
          total: computed.total,
          payments: payments.map((payment) => ({ ...payment, source: "sale", collectedAt })),
          collectionPayments: payments.map((payment) => ({ ...payment, source: "sale", collectedAt })),
          ...(cashTendered !== undefined ? { cashTendered, cashChange } : {}),
          amountPaid: paid,
          dueAmount: due,
          paymentMethod: summaryMethod,
          paymentStatus,
          invoiceNumber,
          ...snapshotInvoiceTerms(req.user.business),
          notes,
        }], { session });

        if (customer) {
          const previousBalance = customer.pendingBalance || 0;
          customer.pendingBalance = round2(previousBalance + due);
          customer.totalPurchased = round2((customer.totalPurchased || 0) + computed.total);
          customer.totalPaid = round2((customer.totalPaid || 0) + paid);
          customer.lastPurchaseAt = new Date();
          await customer.save({ session });

          const entries = [{
            owner: req.user._id,
            customer: customer._id,
            type: "sale",
            amount: computed.total,
            balanceAfter: round2(previousBalance + computed.total),
            reference: sale._id,
            note: `Sale ${sale.invoiceNumber}`,
          }];
          if (paid > 0) entries.push({
            owner: req.user._id,
            customer: customer._id,
            type: "payment",
            amount: -paid,
            balanceAfter: round2(previousBalance + computed.total - paid),
            reference: sale._id,
            collectionSource: "sale",
            paymentMethod: summaryMethod,
            note: `Payment for ${sale.invoiceNumber}`,
          });
          await LedgerEntry.create(entries, { session, ordered: true });
        }
        return {
          resultType: "sale",
          resultId: sale._id,
          value: { sale, customer, created: true },
        };
      },
      replaySnapshot: (snapshot) => ({ ...snapshot, created: false }),
      replay: async (record) => {
        const sale = await Sale.findOne({ _id: record.resultId, owner: req.user._id });
        if (!sale) throw new Error("Idempotent sale record references a missing sale");
        const customer = sale.customer ? await Customer.findOne({ _id: sale.customer, owner: req.user._id }) : null;
        return { sale, customer, created: false };
      },
    });

    // Send notifications after the financial transaction commits.
    let whatsappResult = null;
    if (result.created && result.customer && req.user.preferences?.whatsappAutoInvoice !== false) {
      whatsappResult = await whatsapp.sendInvoice({
        owner: req.user._id,
        customer: result.customer,
        sale: result.sale,
        businessName: req.user.business?.name,
        upiQr: req.user.business?.upiQr,
      });
    }

    res.status(result.created ? 201 : 200).json({ sale: result.sale, whatsapp: whatsappResult });
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
    let customer = {};
    if (sale.customer) {
      customer = await Customer.findOne({ _id: sale.customer, owner: req.user._id }) || {};
    }
    const returnHistory = await ReturnRecord.find({ owner: req.user._id, sale: sale._id }).sort({ createdAt: 1 }).lean();
    res.json({
      invoice: {
        saleId: sale._id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.createdAt,
        business: { ...req.user.business?.toObject?.() ?? req.user.business, email: req.user.email },
        invoiceTerms: sale.invoiceTermsSnapshot || [],
        invoiceReturnPeriodDays: sale.invoiceReturnPeriodDaysSnapshot,
        customer: sale.customerName,
        customerId: sale.customer,
        customerPhone: sale.customerPhoneSnapshot || customer.phone || "",
        customerAddress: sale.customerAddressSnapshot || customer?.address || "",
        customerShopName: sale.customerShopNameSnapshot || customer?.shopName || "",
        customerGstNumber: sale.customerGstNumberSnapshot || customer?.gstNumber || customer?.gstin || "",
        returnHistory,
        customerType: sale.customerType,
        saleType: sale.saleType || "wholesale",
        items: sale.items,
        taxBreakdown: sale.taxBreakdown || [],
        subtotal: sale.subtotal || sale.total, // legacy sales: subtotal == total
        itemDiscountTotal: sale.itemDiscountTotal || 0,
        billDiscountType: sale.billDiscountType || "amount",
        billDiscountValue: sale.billDiscountValue || 0,
        billDiscountAmount: sale.billDiscountAmount || 0,
        totalDiscount: sale.totalDiscount || 0,
        total: sale.total,
        returnedAmount: sale.returnedAmount || 0,
        netTotal: round2((sale.total || 0) - (sale.returnedAmount || 0)),
        returnStatus: sale.returnStatus || "none",
        payments: sale.payments,
        ...(sale.cashTendered !== undefined && sale.cashChange !== undefined
          ? { cashTendered: sale.cashTendered, cashChange: sale.cashChange } : {}),
        amountPaid: sale.amountPaid,
        creditApplied: sale.creditApplied || 0,
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
    const key = requireIdempotencyKey(req);
    const identity = resourceIdempotency({ resourceId: req.params.id, operation: "sale-return", fingerprintOperation: "sale:return", parameter: "saleId", body: req.body });
    const result = await executeIdempotently({
      ownerId: req.user._id,
      ...identity,
      key,
      work: async (session) => {
        const sale = await Sale.findOne({ _id: identity.resourceId, owner: req.user._id }).session(session);
        if (!sale) throw httpError(404, "Sale not found");
        const reqItems = Array.isArray(req.body.items) ? req.body.items : [];
        if (reqItems.length === 0) throw httpError(400, "Select at least one item to return");
        const settlement = await processReturn(sale, reqItems, req.user._id, session);
        const [record] = await ReturnRecord.create([{
          owner: req.user._id,
          sale: sale._id,
          customer: sale.customer,
          invoiceNumber: sale.invoiceNumber,
          type: "return",
          items: settlement.returnedItems,
          quantityReconciliations: settlement.quantityReconciliations,
          refundAmount: settlement.refundTotal,
          cashRefund: settlement.cashRefund,
          cashRefundFromCredit: settlement.creditRefund,
          cashRefundFromLedger: round2(settlement.refundPayments
            .filter((payment) => payment.source === "ledger")
            .reduce((sum, payment) => sum + payment.amount, 0)),
          creditApplied: 0,
          refundPayments: settlement.refundPayments,
          reason: String(req.body.reason || "").slice(0, 200),
          notes: String(req.body.notes || "").slice(0, 500),
        }], { session });
        return {
          resultType: "return",
          resultId: record._id,
          relatedResourceId: sale._id,
          value: { ok: true, refund: settlement.refundTotal, sale, record },
        };
      },
      replay: async (record) => {
        const [sale, returnRecord] = await Promise.all([
          Sale.findOne({ _id: record.relatedResourceId, owner: req.user._id }),
          ReturnRecord.findOne({ _id: record.resultId, owner: req.user._id }),
        ]);
        if (!sale || !returnRecord) throw new Error("Idempotent return record references missing resources");
        return { ok: true, refund: returnRecord.refundAmount, sale, record: returnRecord };
      },
    });
    res.json(result);
  })
);

// POST /api/sales/:id/replace — Replacement v1 = return old items + new sale, settle difference.
// Body: { returnItems:[{productId,quantity}], newItems:[{productId,quantity,...}], payments:[], billDiscount, reason, notes }
router.post(
  "/:id/replace",
  asyncHandler(async (req, res) => {
    const key = requireIdempotencyKey(req);
    const identity = resourceIdempotency({ resourceId: req.params.id, operation: "sale-replace", fingerprintOperation: "sale:replace", parameter: "saleId", body: req.body });
    const result = await executeIdempotently({
      ownerId: req.user._id,
      ...identity,
      key,
      work: async (session) => {
        const sale = await Sale.findOne({ _id: identity.resourceId, owner: req.user._id }).session(session);
        if (!sale) throw httpError(404, "Sale not found");
        const returnItems = Array.isArray(req.body.returnItems) ? req.body.returnItems : [];
        const newItems = Array.isArray(req.body.newItems) ? req.body.newItems : [];
        if (returnItems.length === 0 || newItems.length === 0) {
          throw httpError(400, "Replacement needs both items to return and replacement items");
        }
        if (sale.customerType === "walkin") {
          throw httpError(400, "Replacement is not available for walk-in sales");
        }
        if (req.body.payments != null && !Array.isArray(req.body.payments)) {
          throw httpError(400, "Payments must be an array");
        }

        const settlement = await processReturn(sale, returnItems, req.user._id, session, { replacement: true });
        const customer = sale.customer
          ? await Customer.findOne({ _id: sale.customer, owner: req.user._id }).session(session)
          : null;
        const created = await createSaleFromItems({
          ownerId: req.user._id,
          customer,
          customerName: sale.customerName,
          customerType: customer ? "existing" : "walkin",
          items: newItems,
          payments: req.body.payments || [],
          billDiscount: req.body.billDiscount,
          saleType: sale.saleType || "wholesale",
          replacementOf: sale._id,
          carryCredit: settlement.creditToReplacement,
          business: req.user.business,
          session,
        });

        const priceDifference = round2(created.total - settlement.refundTotal);
        const refundPayments = [
          ...settlement.refundPayments,
          ...cashRefundParts(settlement.paidRefundPayments, created.cashReturned),
        ];
        const cashRefund = round2(settlement.cashRefund + created.cashReturned);
        if (customer && created.cashReturned > 0) {
          await LedgerEntry.create([{
            owner: req.user._id,
            customer: customer._id,
            type: "return",
            amount: 0,
            balanceAfter: customer.pendingBalance,
            reference: sale._id,
            note: `Replacement refund paid for ${sale.invoiceNumber}: ${created.cashReturned.toFixed(2)}`,
          }], { session });
        }
        const [record] = await ReturnRecord.create([{
          owner: req.user._id,
          sale: sale._id,
          customer: sale.customer,
          invoiceNumber: sale.invoiceNumber,
          type: "replacement",
          items: settlement.returnedItems,
          quantityReconciliations: settlement.quantityReconciliations,
          refundAmount: settlement.refundTotal,
          cashRefund,
          cashRefundFromCredit: settlement.creditRefund,
          cashRefundFromLedger: round2(refundPayments
            .filter((payment) => payment.source === "ledger")
            .reduce((sum, payment) => sum + payment.amount, 0)),
          creditApplied: created.carriedCredit,
          refundPayments,
          replacementSale: created.sale._id,
          replacementAmount: created.total,
          priceDifference,
          reason: String(req.body.reason || "").slice(0, 200),
          notes: String(req.body.notes || "").slice(0, 500),
        }], { session });
        return {
          resultType: "replacement",
          resultId: record._id,
          relatedResourceId: created.sale._id,
          value: {
            ok: true,
            refund: settlement.refundTotal,
            replacementAmount: created.total,
            priceDifference,
            sale,
            newSale: created.sale,
            record,
          },
        };
      },
      replay: async (record) => {
        const [returnRecord, newSale] = await Promise.all([
          ReturnRecord.findOne({ _id: record.resultId, owner: req.user._id }),
          Sale.findOne({ _id: record.relatedResourceId, owner: req.user._id }),
        ]);
        if (!returnRecord || !newSale) throw new Error("Idempotent replacement references missing resources");
        const sale = await Sale.findOne({ _id: returnRecord.sale, owner: req.user._id });
        if (!sale) throw new Error("Idempotent replacement references a missing original sale");
        return {
          ok: true,
          refund: returnRecord.refundAmount,
          replacementAmount: returnRecord.replacementAmount,
          priceDifference: returnRecord.priceDifference,
          sale,
          newSale,
          record: returnRecord,
        };
      },
    });
    res.json(result);
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
    const format = req.query.format || "a4";
    if (!["a4", "thermal80", "thermal58"].includes(format)) {
      res.status(400);
      throw new Error("Invoice format must be a4, thermal80, or thermal58.");
    }
    const sale = await Sale.findOne({ _id: req.params.id, owner: req.user._id });
    if (!sale) {
      res.status(404);
      throw new Error("Sale not found");
    }
    let customer = {};
    if (sale.customer) customer = (await Customer.findOne({ _id: sale.customer, owner: req.user._id })) || {};
    const business = { ...req.user.business?.toObject?.() ?? req.user.business, email: req.user.email };
    const returnHistory = await ReturnRecord.find({ owner: req.user._id, sale: sale._id }).sort({ createdAt: 1 }).lean();
    const invoiceCustomer = {
      ...customer?.toObject?.() ?? customer,
      name: sale.customerName,
      phone: sale.customerPhoneSnapshot || customer?.phone || "",
      shopName: sale.customerShopNameSnapshot || customer?.shopName || "",
      address: sale.customerAddressSnapshot || customer?.address || "",
      gstNumber: sale.customerGstNumberSnapshot || customer?.gstNumber || customer?.gstin || "",
    };
    const pdf = await buildInvoicePdf({ ...sale.toObject(), returnHistory }, business, invoiceCustomer, { format });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${sale.invoiceNumber}-${format}.pdf"`);
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
    const customer = await Customer.findOne({ _id: sale.customer, owner: req.user._id });
    if (!customer || !customer.phone) {
      res.status(400);
      throw new Error("Customer has no phone number on file");
    }
    const business = { ...req.user.business?.toObject?.() ?? req.user.business, email: req.user.email };
    const returnHistory = await ReturnRecord.find({ owner: req.user._id, sale: sale._id }).sort({ createdAt: 1 }).lean();
    const invoiceCustomer = {
      ...customer.toObject(),
      name: sale.customerName,
      phone: sale.customerPhoneSnapshot || customer.phone,
      shopName: sale.customerShopNameSnapshot || customer.shopName,
      address: sale.customerAddressSnapshot || customer.address,
      gstNumber: sale.customerGstNumberSnapshot || customer.gstNumber,
    };
    const pdfBuffer = await buildInvoicePdf({ ...sale.toObject(), returnHistory }, business, invoiceCustomer, { format: "a4" });
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
