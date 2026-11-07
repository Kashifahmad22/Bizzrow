const crypto = require("crypto");

function summarizeBatchStock(productStock, batches) {
  const stock = Math.max(0, Number(productStock) || 0);
  const batchRemaining = batches.reduce((sum, batch) => sum + (Number(batch.remainingQuantity) || 0), 0);
  return {
    stock,
    batchRemaining,
    legacyUnbatchedStock: Math.max(0, stock - batchRemaining),
    inconsistent: batchRemaining > stock,
  };
}

function allocateBatchQuantities(batches, quantity) {
  let remaining = quantity;
  const allocations = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Number(batch.remainingQuantity) || 0);
    if (amount <= 0) continue;
    allocations.push({
      batch: batch._id,
      quantity: amount,
      costPrice: batch.costPrice == null ? null : Number(batch.costPrice),
    });
    remaining -= amount;
  }
  return { allocations, legacyQuantity: remaining };
}

function distributeBatchAllocations(items, allocationsByProduct) {
  const pending = new Map(
    [...allocationsByProduct].map(([productId, allocation]) => [
      productId,
      {
        legacyQuantity: allocation.legacyQuantity,
        allocations: allocation.allocations.map((entry) => ({ ...entry })),
      },
    ])
  );
  for (const item of items) {
    const source = pending.get(String(item.product)) || { legacyQuantity: 0, allocations: [] };
    const allocations = source.allocations;
    let remaining = Number(item.quantity) || 0;
    item.legacyQuantityFirst = Math.min(remaining, source.legacyQuantity);
    source.legacyQuantity -= item.legacyQuantityFirst;
    remaining -= item.legacyQuantityFirst;
    const assigned = [];
    while (remaining > 0 && allocations.length) {
      const allocation = allocations[0];
      const quantity = Math.min(remaining, allocation.quantity);
      assigned.push({ ...allocation, quantity });
      allocation.quantity -= quantity;
      remaining -= quantity;
      if (allocation.quantity === 0) allocations.shift();
    }
    item.batchAllocations = assigned;
  }
  return items;
}

function returnedBatchAllocations(item, quantity) {
  let start = Math.max(0, Number(item.returnedQty) || 0);
  let remaining = quantity;
  const result = [];
  const legacyFirst = Math.max(0, Number(item.legacyQuantityFirst) || 0);
  const legacyReturned = Math.min(remaining, Math.max(0, legacyFirst - start));
  remaining -= legacyReturned;
  start = Math.max(0, start - legacyFirst);
  for (const allocation of item.batchAllocations || []) {
    if (remaining <= 0) break;
    const allocationQty = Number(allocation.quantity) || 0;
    if (start >= allocationQty) {
      start -= allocationQty;
      continue;
    }
    const amount = Math.min(remaining, allocationQty - start);
    if (amount > 0) result.push({ batch: allocation.batch, quantity: amount });
    remaining -= amount;
    start = 0;
  }
  return { allocations: result, unbatchedQuantity: legacyReturned + remaining };
}

async function restoreBatchStock({ StockBatch, ownerId, productId, allocations, session }) {
  for (const allocation of allocations) {
    const batch = await StockBatch.findOne({
      _id: allocation.batch,
      owner: ownerId,
      product: productId,
    }).session(session);
    if (!batch || batch.remainingQuantity + allocation.quantity > batch.quantityReceived) {
      throw Object.assign(new Error("Cannot restore batch stock"), { status: 409 });
    }
    const update = await StockBatch.updateOne(
      {
        _id: allocation.batch,
        owner: ownerId,
        product: productId,
        remainingQuantity: batch.remainingQuantity,
      },
      { $inc: { remainingQuantity: allocation.quantity } },
      { session }
    );
    if (update.modifiedCount !== 1) {
      throw Object.assign(new Error("Batch stock changed during return"), { status: 409 });
    }
  }
}

function makeBatchCode(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `B-${day}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function addStockBatch({ Product, StockBatch, ownerId, productId, batch, session }) {
  const product = await Product.findOne({ _id: productId, owner: ownerId }).session(session);
  if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
  const existingBatches = await StockBatch.find({ owner: ownerId, product: product._id }).session(session);
  if (summarizeBatchStock(product.stock, existingBatches).inconsistent) {
    throw Object.assign(new Error("Batch stock does not reconcile with product stock"), { status: 409 });
  }
  const duplicate = await StockBatch.findOne({
    owner: ownerId,
    product: product._id,
    batchCode: batch.batchCode,
  }).session(session);
  if (duplicate) throw Object.assign(new Error("This batch identifier already exists for the product"), { status: 409 });

  const [created] = await StockBatch.create([{
    ...batch,
    owner: ownerId,
    product: product._id,
    remainingQuantity: batch.quantityReceived,
  }], { session });
  const updated = await Product.updateOne(
    { _id: product._id, owner: ownerId, stock: product.stock },
    { $inc: { stock: batch.quantityReceived } },
    { session }
  );
  if (updated.modifiedCount !== 1) {
    throw Object.assign(new Error("Product stock changed during batch creation; retry the operation"), { status: 409 });
  }
  return { batch: created, stock: product.stock + batch.quantityReceived };
}

async function loadProductBatches(StockBatch, ownerId, productId, session) {
  let query = StockBatch.find({ owner: ownerId, product: productId, remainingQuantity: { $gt: 0 } })
    .sort({ purchaseDate: 1, createdAt: 1, _id: 1 });
  if (session) query = query.session(session);
  return query;
}

module.exports = {
  allocateBatchQuantities,
  addStockBatch,
  distributeBatchAllocations,
  loadProductBatches,
  makeBatchCode,
  returnedBatchAllocations,
  restoreBatchStock,
  summarizeBatchStock,
};
