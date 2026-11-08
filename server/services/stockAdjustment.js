const { summarizeBatchStock } = require("./stockBatchService");

const error = (status, message) => Object.assign(new Error(message), { status });

async function adjustStock({ Product, StockBatch, StockAdjustment, ownerId, productId, batchId, delta, reason, session }) {
  if (!Number.isFinite(delta) || delta === 0) throw error(400, "A non-zero adjustment quantity is required");
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
    throw error(400, "An adjustment reason of 1 to 500 characters is required");
  }
  const product = await Product.findOne({ _id: productId, owner: ownerId }).session(session);
  if (!product) throw error(404, "Product not found");
  const batches = await StockBatch.find({ owner: ownerId, product: product._id }).session(session);
  const summary = summarizeBatchStock(product.stock, batches);
  if (summary.inconsistent) throw error(409, "Batch stock does not reconcile with product stock");

  const batch = batchId ? batches.find((entry) => String(entry._id) === String(batchId)) : null;
  if (batchId && !batch) throw error(404, "Batch not found");
  const sourceBefore = batch ? batch.remainingQuantity : summary.legacyUnbatchedStock;
  const sourceAfter = sourceBefore + delta;
  if (sourceAfter < 0) throw error(400, "Adjustment cannot make the selected stock negative");
  if (batch && delta > 0) {
    const previous = await StockAdjustment.find({
      owner: ownerId, product: product._id, batch: batch._id,
    }).select("delta").session(session);
    const reversible = -previous.reduce((sum, entry) => sum + entry.delta, 0);
    if (delta > reversible || sourceAfter > batch.quantityReceived) {
      throw error(409, "Batch increases may only reverse previously recorded reductions");
    }
  }
  if (batch) {
    const updatedBatch = await StockBatch.updateOne(
      { _id: batch._id, owner: ownerId, product: product._id, remainingQuantity: sourceBefore },
      { $inc: { remainingQuantity: delta } }, { session }
    );
    if (updatedBatch.modifiedCount !== 1) throw error(409, "Batch stock changed; retry the adjustment");
  }
  const update = await Product.updateOne(
    { _id: product._id, owner: ownerId, stock: product.stock },
    { $inc: { stock: delta } }, { session }
  );
  if (update.modifiedCount !== 1) throw error(409, "Product stock changed; retry the adjustment");
  const [adjustment] = await StockAdjustment.create([{
    owner: ownerId, product: product._id, batch: batch ? batch._id : null,
    delta, reason: reason.trim(), stockBefore: product.stock, stockAfter: product.stock + delta,
    sourceBefore, sourceAfter,
  }], { session });
  product.stock += delta;
  return { product, adjustment };
}

module.exports = { adjustStock };
