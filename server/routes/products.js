const express = require("express");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const StockAdjustment = require("../models/StockAdjustment");
const Sale = require("../models/Sale");
const ReturnRecord = require("../models/ReturnRecord");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { buildTextFilter } = require("../utils/search");
const ai = require("../services/aiService");
const { normalizeExtraction } = require("../utils/ocrNormalize");
const { clampLimit, clampPage, pageMeta } = require("../utils/validate");
const { normalizeProductPrices, serializeProduct } = require("../utils/productPricing");
const { buildProductCsv, inventoryFilename } = require("../utils/productExport");
const { detectProductDuplicates } = require("../utils/productDuplicates");
const { deleteUnusedProduct, isValidProductId } = require("../services/productDeletion");
const { adjustStock } = require("../services/stockAdjustment");
const {
  executeIdempotently,
  requestFingerprint,
  requireIdempotencyKey,
  runFinancialTransaction,
} = require("../services/financialTransaction");
const {
  addStockBatch,
  makeBatchCode,
  summarizeBatchStock,
} = require("../services/stockBatchService");

const router = express.Router();
router.use(protect);

const PRODUCT_FIELDS = [
  "name", "category", "color", "size", "sku", "barcode",
  "brand", "unit", "gstPct", "hsn", "marginPct",
  "costPrice", "sellingPrice", "wholesalePrice", "retailPrice", "stock", "image",
];

router.get(
  "/export.csv",
  asyncHandler(async (req, res) => {
    const [products, batches] = await Promise.all([
      Product.find({ owner: req.user._id }).sort({ createdAt: 1 }).lean(),
      StockBatch.find({ owner: req.user._id }).select("product supplierName").lean(),
    ]);
    const suppliersByProduct = new Map();
    for (const batch of batches) {
      const name = String(batch.supplierName || "").trim();
      if (!name) continue;
      const productId = String(batch.product);
      if (!suppliersByProduct.has(productId)) suppliersByProduct.set(productId, new Set());
      suppliersByProduct.get(productId).add(name);
    }
    const exportProducts = products.map((product) => ({
      ...product,
      supplier: [...(suppliersByProduct.get(String(product._id)) || [])].join("; "),
    }));
    const filename = inventoryFilename(req.user.business?.name);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    res.send(`\uFEFF${buildProductCsv(exportProducts)}`);
  })
);

router.get(
  "/duplicates",
  asyncHandler(async (req, res) => {
    const products = await Product.find({ owner: req.user._id })
      .select("_id name sku barcode category brand size color stock costPrice sellingPrice wholesalePrice retailPrice unit")
      .lean();
    const duplicates = detectProductDuplicates(products);
    res.json({ duplicates, totalPairs: duplicates.length });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, status, maxQty, sort } = req.query;
    const filter = {
      owner: req.user._id,
      ...buildTextFilter(q, ["name", "sku", "barcode", "category", "brand", "color", "size"], {
        separatorInsensitive: true,
      }),
    };
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
    res.json({ products: products.map(serializeProduct), ...pageMeta(total, page, limit) });
  })
);

router.get(
  "/:id/batches",
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, owner: req.user._id }).lean();
    if (!product) {
      res.status(404);
      throw new Error("Product not found");
    }
    const batches = await StockBatch.find({ owner: req.user._id, product: product._id })
      .sort({ purchaseDate: 1, createdAt: 1, _id: 1 })
      .lean();
    res.json({
      product: serializeProduct(product),
      batches,
      ...summarizeBatchStock(product.stock, batches),
    });
  })
);

router.post(
  "/:id/batches",
  asyncHandler(async (req, res) => {
    const key = requireIdempotencyKey(req);
    const fingerprint = requestFingerprint("product:batch", { productId: req.params.id }, req.body);
    const quantity = Number(req.body.quantityReceived);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400);
      throw new Error("quantityReceived must be a positive number");
    }
    const purchaseDate = req.body.purchaseDate ? new Date(req.body.purchaseDate) : new Date();
    if (!Number.isFinite(purchaseDate.getTime())) {
      res.status(400);
      throw new Error("purchaseDate must be a valid date");
    }
    const costPrice = req.body.costPrice == null || req.body.costPrice === "" ? null : Number(req.body.costPrice);
    if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0)) {
      res.status(400);
      throw new Error("costPrice must be a non-negative number");
    }

    const result = await executeIdempotently({
      ownerId: req.user._id,
      operation: `stock-batch:${req.params.id}`,
      key,
      fingerprint,
      work: async (session) => {
        const batchCode = String(req.body.batchCode || makeBatchCode(purchaseDate)).trim();
        if (!batchCode || batchCode.length > 60) {
          throw Object.assign(new Error("batchCode must contain 1 to 60 characters"), { status: 400 });
        }
        const created = await addStockBatch({
          Product,
          StockBatch,
          ownerId: req.user._id,
          productId: req.params.id,
          batch: {
            batchCode,
            purchaseDate,
            quantityReceived: quantity,
            costPrice,
            supplierName: String(req.body.supplierName || "").trim(),
            purchaseReference: String(req.body.purchaseReference || "").trim(),
            notes: String(req.body.notes || "").trim(),
          },
          session,
        });
        return {
          resultType: "stock-batch",
          resultId: created.batch._id,
          value: created,
        };
      },
      replay: async (record) => {
        const [batch, product] = await Promise.all([
          StockBatch.findOne({
            _id: record.resultId,
            owner: req.user._id,
            product: req.params.id,
          }),
          Product.findOne({ _id: req.params.id, owner: req.user._id }),
        ]);
        if (!batch || !product) {
          throw new Error("Idempotent batch record references missing resources");
        }
        return { batch, stock: product.stock };
      },
    });
    res.status(201).json(result);
  })
);

// POST /api/products
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, costPrice } = req.body;
    if (!name || (req.body.wholesalePrice == null && req.body.sellingPrice == null)) {
      res.status(400);
      throw new Error("name and wholesale selling price are required");
    }
    const payload = { owner: req.user._id };
    for (const f of PRODUCT_FIELDS) if (f in req.body) payload[f] = req.body[f];
    Object.assign(payload, normalizeProductPrices(req.body, { creating: true }));
    if (costPrice != null) {
      const parsedCost = Number(costPrice);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        res.status(400);
        throw new Error("costPrice must be a non-negative number");
      }
      payload.costPrice = parsedCost;
    } else {
      payload.costPrice = null;
    }
    payload.stock = req.body.stock || 0;
    const product = await Product.create(payload);
    res.status(201).json({ product: serializeProduct(product) });
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
    if ("stock" in req.body && Number(req.body.stock) !== Number(product.stock)) {
      res.status(409);
      throw new Error("Use stock adjustment or add a purchase batch to change product stock");
    }
    for (const f of PRODUCT_FIELDS) {
      if (["sellingPrice", "wholesalePrice", "retailPrice", "stock"].includes(f)) continue;
      if (f in req.body) product[f] = req.body[f];
    }
    Object.assign(product, normalizeProductPrices(req.body));
    if ("costPrice" in req.body) {
      const cost = req.body.costPrice == null || req.body.costPrice === "" ? null : Number(req.body.costPrice);
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) {
        res.status(400);
        throw new Error("costPrice must be a non-negative number");
      }
      product.costPrice = cost;
    }
    await product.save();
    res.json({ product: serializeProduct(product) });
  })
);

const adjustStockRoute = asyncHandler(async (req, res) => {
  const key = requireIdempotencyKey(req);
  const fingerprint = requestFingerprint("product:stock-adjustment", { productId: req.params.id }, req.body);
  const result = await executeIdempotently({
    ownerId: req.user._id,
    operation: `stock-adjustment:${req.params.id}`,
    key,
    fingerprint,
    work: async (session) => {
      const { product, adjustment } = await adjustStock({
        Product, StockBatch, StockAdjustment, ownerId: req.user._id,
        productId: req.params.id, batchId: req.body.batchId || null,
        delta: req.body.delta, reason: req.body.reason, session,
      });
      return { resultType: "stock-adjustment", resultId: adjustment._id, value: { product, adjustment } };
    },
    replay: async (record) => {
      const adjustment = await StockAdjustment.findOne({ _id: record.resultId, owner: req.user._id, product: req.params.id });
      const product = await Product.findOne({ _id: req.params.id, owner: req.user._id });
      if (!adjustment || !product) throw new Error("Idempotent adjustment references missing resources");
      return { product, adjustment };
    },
  });
  res.json({ product: serializeProduct(result.product), adjustment: result.adjustment });
});

router.patch("/:id/stock", adjustStockRoute);
router.post("/:id/stock-adjustments", adjustStockRoute);

router.get("/:id/stock-adjustments", asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, owner: req.user._id }).select("_id");
  if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
  const adjustments = await StockAdjustment.find({ owner: req.user._id, product: product._id })
    .sort({ createdAt: -1, _id: -1 }).limit(101).lean();
  res.json({ adjustments: adjustments.slice(0, 100), hasMore: adjustments.length > 100 });
}));

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
      if (!p.name || (p.wholesalePrice == null && p.sellingPrice == null)) continue;
      const doc = { owner: req.user._id };
      for (const f of PRODUCT_FIELDS) if (f in p) doc[f] = p[f];
      Object.assign(doc, normalizeProductPrices(p, { creating: true }));
      if (p.costPrice == null || p.costPrice === "") {
        doc.costPrice = null;
      } else {
        const cost = Number(p.costPrice);
        if (!Number.isFinite(cost) || cost < 0) continue;
        doc.costPrice = cost;
      }
      doc.stock = p.stock || 0;
      docs.push(doc);
    }
    if (docs.length === 0) {
      res.status(400);
      throw new Error("Approved products are missing required fields (name and wholesale selling price)");
    }
    const created = await Product.insertMany(docs);
    res.status(201).json({ created: created.length, products: created.map(serializeProduct) });
  })
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isValidProductId(req.params.id)) {
      res.status(400);
      throw new Error("Invalid product ID");
    }
    const deletedProduct = await runFinancialTransaction((session) => deleteUnusedProduct({
      Product,
      Sale,
      ReturnRecord,
      StockBatch,
      StockAdjustment,
      ownerId: req.user._id,
      productId: req.params.id,
      session,
    }));
    res.json({
      ok: true,
      message: `Deleted unused product "${deletedProduct.name}".`,
      product: deletedProduct,
    });
  })
);

module.exports = router;
