const express = require("express");
const Product = require("../models/Product");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { buildTextFilter } = require("../utils/search");
const ai = require("../services/aiService");
const { normalizeExtraction } = require("../utils/ocrNormalize");
const { clampLimit, clampPage, pageMeta } = require("../utils/validate");

const router = express.Router();
router.use(protect);

const PRODUCT_FIELDS = [
  "name", "category", "color", "size", "sku",
  "brand", "unit", "gstPct", "hsn", "marginPct",
  "costPrice", "sellingPrice", "stock", "image",
];

// GET /api/products?q=&limit=
// Backward compatible: no params returns all products (existing behavior).
// `q` searches name / sku / category / color / size (used by the Sales product search).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, status, maxQty, sort } = req.query;
    const filter = { owner: req.user._id, ...buildTextFilter(q, ["name", "sku", "category", "brand", "color", "size"]) };
    if (status === "out") filter.stock = 0;
    else if (status === "low") filter.stock = { $gt: 0, $lte: 10 };
    else if (status === "fast") filter.soldCount = { $gte: 5 };
    else if (status === "slow") filter.soldCount = { $gt: 0, $lt: 5 };
    const maxQtyN = Number(maxQty);
    if (maxQtyN > 0) filter.stock = { ...(typeof filter.stock === "object" ? filter.stock : {}), $lt: maxQtyN };

    let sortSpec = { createdAt: -1 };
    if (sort === "oldest") sortSpec = { createdAt: 1 };
    else if (sort === "stock_desc") sortSpec = { stock: -1 };
    else if (sort === "stock_asc") sortSpec = { stock: 1 };
    else if (sort === "best") sortSpec = { soldCount: -1 };
    else if (sort === "least") sortSpec = { soldCount: 1 };

    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 24, 200);
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortSpec).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ products, ...pageMeta(total, page, limit) });
  })
);

// POST /api/products
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, costPrice, sellingPrice } = req.body;
    if (!name || costPrice == null || sellingPrice == null) {
      res.status(400);
      throw new Error("name, costPrice and sellingPrice are required");
    }
    const payload = { owner: req.user._id };
    for (const f of PRODUCT_FIELDS) if (f in req.body) payload[f] = req.body[f];
    payload.stock = req.body.stock || 0;
    const product = await Product.create(payload);
    res.status(201).json({ product });
  })
);

// PUT /api/products/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
    if (!product) {
      res.status(404);
      throw new Error("Product not found");
    }
    for (const f of PRODUCT_FIELDS) if (f in req.body) product[f] = req.body[f];
    await product.save();
    res.json({ product });
  })
);

// PATCH /api/products/:id/stock — adjust by delta (+ or -)
router.patch(
  "/:id/stock",
  asyncHandler(async (req, res) => {
    const { delta } = req.body;
    if (typeof delta !== "number") {
      res.status(400);
      throw new Error("delta (number) is required");
    }
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
    if (!product) {
      res.status(404);
      throw new Error("Product not found");
    }
    product.stock = Math.max(0, product.stock + delta);
    await product.save();
    res.json({ product });
  })
);

// POST /api/products/import/extract — OCR a supplier invoice into draft items.
// Body: { file: base64String, mimeType: "image/png" | "image/jpeg" | "application/pdf" }
// NEVER writes to the database — extraction only (review workflow happens client-side).
router.post(
  "/import/extract",
  asyncHandler(async (req, res) => {
    const { file, mimeType } = req.body;
    if (!file || !mimeType) {
      res.status(400);
      throw new Error("file (base64) and mimeType are required");
    }
    if (!/^image\/(png|jpe?g|webp|heic|heif)$/i.test(mimeType) && mimeType !== "application/pdf") {
      res.status(400);
      throw new Error("Unsupported file type. Upload a PDF or an image (PNG / JPG).");
    }
    const base64 = String(file).includes(",") ? String(file).split(",").pop() : file; // strip data: prefix if present
    let raw;
    try {
      raw = await ai.extractInvoiceProducts({ base64, mimeType });
    } catch (err) {
      res.status(502);
      throw new Error(`Could not read the invoice: ${err.message}`);
    }
    res.json({ extraction: normalizeExtraction(raw) });
  })
);

// POST /api/products/import/commit — create inventory ONLY after user review/approval.
// Body: { products: [{ name, costPrice, sellingPrice, ... }] }
router.post(
  "/import/commit",
  asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.products) ? req.body.products : [];
    if (list.length === 0) {
      res.status(400);
      throw new Error("No approved products to create");
    }
    const docs = [];
    for (const p of list) {
      if (!p.name || p.costPrice == null || p.sellingPrice == null) continue;
      const doc = { owner: req.user._id };
      for (const f of PRODUCT_FIELDS) if (f in p) doc[f] = p[f];
      doc.stock = p.stock || 0;
      docs.push(doc);
    }
    if (docs.length === 0) {
      res.status(400);
      throw new Error("Approved products are missing required fields (name, cost, selling price)");
    }
    const created = await Product.insertMany(docs);
    res.status(201).json({ created: created.length, products: created });
  })
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await Product.deleteOne({ _id: req.params.id, owner: req.user._id });
    if (result.deletedCount === 0) {
      res.status(404);
      throw new Error("Product not found");
    }
    res.json({ ok: true });
  })
);

module.exports = router;
