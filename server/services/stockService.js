const {
  allocateBatchQuantities,
  distributeBatchAllocations,
  loadProductBatches,
  summarizeBatchStock,
} = require("./stockBatchService");
const { add, subtract } = require("../utils/quantity");
const httpError = (status, message) => Object.assign(new Error(message), { status });

function getStockRequirements(items) {
  const quantities = new Map();
  for (const item of items) {
    const productId = String(item.product);
    quantities.set(productId, add(quantities.get(productId) || 0, item.quantity));
  }
  return quantities;
}

async function decrementStock({ Product, StockBatch, items, ownerId, session }) {
  const allocationsByProduct = new Map();
  for (const [productId, quantity] of getStockRequirements(items)) {
    let batchAllocation = { allocations: [], legacyQuantity: quantity };
    let productQuery = Product.findOne({ _id: productId, owner: ownerId });
    if (session) productQuery = productQuery.session(session);
    const product = await productQuery;
    if (!product || product.stock < quantity) throw httpError(409, "Insufficient stock; sale was not completed");
    let batches;
    if (StockBatch) {
      batches = await loadProductBatches(StockBatch, ownerId, productId, session);
      const summary = summarizeBatchStock(product.stock, batches);
      if (summary.inconsistent) {
        throw httpError(409, "Batch stock does not reconcile with product stock; correct inventory before selling");
      }
      const legacyQuantity = Math.min(quantity, summary.legacyUnbatchedStock);
      batchAllocation = allocateBatchQuantities(batches, subtract(quantity, legacyQuantity));
      batchAllocation.legacyQuantity = add(batchAllocation.legacyQuantity, legacyQuantity);
    }

    const result = await Product.updateOne(
      { _id: productId, owner: ownerId, stock: product.stock },
      { $set: { stock: subtract(product.stock, quantity), soldCount: add(product.soldCount || 0, quantity) } },
      { session }
    );
    if (result.modifiedCount !== 1) {
      throw httpError(409, "Insufficient stock; sale was not completed");
    }
    if (StockBatch) {
      for (const allocation of batchAllocation.allocations) {
        const batch = batches.find((entry) => String(entry._id) === String(allocation.batch));
        const updated = await StockBatch.updateOne(
          {
            _id: allocation.batch,
            owner: ownerId,
            product: productId,
            remainingQuantity: batch.remainingQuantity,
          },
          { $set: { remainingQuantity: subtract(batch.remainingQuantity, allocation.quantity) } },
          { session }
        );
        if (updated.modifiedCount !== 1) {
          throw httpError(409, "Batch stock changed during sale; sale was not completed");
        }
      }
      allocationsByProduct.set(String(productId), batchAllocation);
    }
  }
  if (StockBatch) distributeBatchAllocations(items, allocationsByProduct);
  return allocationsByProduct;
}

module.exports = { decrementStock, getStockRequirements };
