const express = require("express");
const { protect } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const InventoryAudit = require("../models/InventoryAudit");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const StockAdjustment = require("../models/StockAdjustment");
const { summarizeBatchStock } = require("../services/stockBatchService");
const { adjustStock } = require("../services/stockAdjustment");
const { subtract, validateNewQuantity, exactQuantity } = require("../utils/quantity");
const { customerId } = require("../utils/customerInput");
const { runFinancialTransaction, executeIdempotently, requireIdempotencyKey, resourceIdempotency } = require("../services/financialTransaction");

const router = express.Router();
const error = (status, message) => Object.assign(new Error(message), { status });
router.use(protect);

router.get("/", asyncHandler(async (req, res) => {
  const audits = await InventoryAudit.find({ owner: req.user._id })
    .select("status remarks createdAt completedAt").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ audits });
}));

router.post("/", asyncHandler(async (req, res) => {
  const { allProducts, productIds } = req.body;
  if (allProducts !== true && (!Array.isArray(productIds) || !productIds.length)) {
    throw error(400, "Select products or explicitly select all inventory");
  }
  if (allProducts === true && productIds !== undefined) throw error(400, "Choose either all products or selected products");
  const ids = allProducts === true ? null : productIds.map(customerId);
  if (ids && new Set(ids).size !== ids.length) throw error(400, "Duplicate products are not allowed");
  const audit = await runFinancialTransaction(async (session) => {
    const filter = { owner: req.user._id, ...(ids && { _id: { $in: ids } }) };
    const products = await Product.find(filter).select("name stock stockRevision").sort({ _id: 1 }).session(session).lean();
    if (!products.length || (ids && products.length !== ids.length)) throw error(404, "One or more selected products were not found");
    const batches = await StockBatch.find({ owner: req.user._id, product: { $in: products.map((p) => p._id) } }).session(session).lean();
    const items = products.map((product) => {
      const ownedBatches = batches.filter((batch) => String(batch.product) === String(product._id));
      const summary = summarizeBatchStock(product.stock, ownedBatches);
      if (summary.inconsistent) throw error(409, `Stock does not reconcile for ${product.name}; resolve inventory first`);
      return {
        product: product._id, name: product.name, systemStock: product.stock, stockRevision: product.stockRevision || 0,
        sources: [
          ...ownedBatches.map((batch) => ({ batch: batch._id, batchCode: batch.batchCode, systemQuantity: batch.remainingQuantity })),
          { batch: null, systemQuantity: summary.legacyUnbatchedStock },
        ],
      };
    });
    const [created] = await InventoryAudit.create([{ owner: req.user._id, items }], { session });
    return created;
  });
  res.status(201).json({ audit });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const audit = await InventoryAudit.findOne({ _id: customerId(req.params.id), owner: req.user._id }).lean();
  if (!audit) throw error(404, "Inventory audit not found");
  res.json({ audit });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const id = customerId(req.params.id);
  if (!Array.isArray(req.body.items) || typeof req.body.remarks !== "string" || req.body.remarks.length > 500) {
    throw error(400, "Counts and remarks are required");
  }
  const audit = await InventoryAudit.findOne({ _id: id, owner: req.user._id });
  if (!audit) throw error(404, "Inventory audit not found");
  if (audit.status !== "draft") throw error(409, "Completed audits cannot be changed");
  if (!Number.isSafeInteger(req.body.revision) || req.body.revision !== audit.__v) {
    throw error(409, "Audit changed; reload and review it");
  }
  if (req.body.items.length !== audit.items.length) throw error(400, "A count is required for every product");
  for (let i = 0; i < audit.items.length; i++) {
    const item = audit.items[i];
    const input = req.body.items[i];
    if (!input || input.product !== String(item.product) || !Array.isArray(input.sources) || input.sources.length !== item.sources.length) {
      throw error(400, "Counted products and batches must match the audit snapshot");
    }
    for (let j = 0; j < item.sources.length; j++) {
      const source = item.sources[j];
      const count = input.sources[j];
      if (!count || (count.batch || null) !== (source.batch ? String(source.batch) : null)) {
        throw error(400, "Counted batch must match the audit snapshot");
      }
      const quantity = exactQuantity(count.physicalQuantity);
      if (quantity < 0) throw error(400, "Physical counts cannot be negative");
      const difference = subtract(quantity, source.systemQuantity);
      if (difference !== 0) validateNewQuantity(difference, { signed: true });
      if (typeof count.reason !== "string" || count.reason.length > 500 || (difference !== 0 && !count.reason.trim())) {
        throw error(400, "A reason is required for every discrepancy");
      }
      source.physicalQuantity = quantity;
      source.difference = difference;
      source.reason = count.reason.trim();
    }
  }
  audit.remarks = req.body.remarks;
  const updated = await InventoryAudit.findOneAndUpdate(
    { _id: id, owner: req.user._id, status: "draft", __v: audit.__v },
    { $set: { items: audit.items, remarks: audit.remarks }, $inc: { __v: 1 } }, { new: true, runValidators: true }
  );
  if (!updated) throw error(409, "Audit changed; reload and review it");
  res.json({ audit: updated });
}));

router.post("/:id/approve", asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const identity = resourceIdempotency({ resourceId: req.params.id, operation: "inventory-audit", fingerprintOperation: "inventory:audit", parameter: "auditId", body: req.body });
  const result = await executeIdempotently({
    ownerId: req.user._id, ...identity, key,
    work: async (session) => {
      const audit = await InventoryAudit.findOne({ _id: identity.resourceId, owner: req.user._id }).session(session);
      if (!audit) throw error(404, "Inventory audit not found");
      if (audit.status !== "draft") throw error(409, "Audit is already completed");
      if (!Number.isSafeInteger(req.body.revision) || req.body.revision !== audit.__v) {
        throw error(409, "Audit counts changed; reload and review before approval");
      }
      for (const item of audit.items) {
        if (item.sources.some((source) => source.physicalQuantity == null)) throw error(400, "Record every physical count before approval");
        const product = await Product.findOne({ _id: item.product, owner: req.user._id }).session(session).lean();
        const batches = await StockBatch.find({ owner: req.user._id, product: item.product }).session(session).lean();
        if (!product || product.stock !== item.systemStock || (product.stockRevision || 0) !== item.stockRevision
          || batches.length !== item.sources.length - 1
          || item.sources.some((source) => source.batch && !batches.some((batch) =>
            String(batch._id) === String(source.batch) && batch.remainingQuantity === source.systemQuantity))) {
          throw error(409, `Stock changed for ${item.name}; start a new audit and recount`);
        }
        const locked = await Product.updateOne(
          { _id: item.product, owner: req.user._id, stock: item.systemStock,
            stockRevision: item.stockRevision === 0 ? { $in: [0, null] } : item.stockRevision },
          { $inc: { stockRevision: 1 } }, { session }
        );
        if (locked.matchedCount !== 1) throw error(409, `Stock changed for ${item.name}; start a new audit and recount`);
        for (const source of item.sources) {
          if (source.difference === 0) continue;
          const result = await adjustStock({
            Product, StockBatch, StockAdjustment, ownerId: req.user._id, productId: item.product,
            batchId: source.batch, delta: source.difference, reason: source.reason, session,
          });
          source.adjustment = result.adjustment._id;
        }
      }
      audit.status = "completed";
      audit.completedAt = new Date();
      await audit.save({ session });
      return { resultType: "inventory-audit", resultId: audit._id, value: { audit } };
    },
    replay: async (record) => {
      const audit = await InventoryAudit.findOne({ _id: record.resultId, owner: req.user._id });
      if (!audit) throw error(409, "Audit history is unavailable");
      return { audit };
    },
  });
  res.json(result);
}));

module.exports = router;
