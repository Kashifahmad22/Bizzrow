const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const StockAdjustment = require("../models/StockAdjustment");
const Counter = require("../models/Counter");
const { addStockBatch, restoreBatchStock, returnedBatchAllocations } = require("../services/stockBatchService");
const { adjustStock } = require("../services/stockAdjustment");
const { decrementStock } = require("../services/stockService");
const { runFinancialTransaction, executeIdempotently, idempotencyIdentity, requestFingerprint } = require("../services/financialTransaction");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("isolated inventory transactions reconcile batches, returns, adjustments, rollback and retries", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async () => {
  const parsed = new URL(uri);
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname.toLowerCase())
      || !/(^test|[-_]test|testing)/i.test(name)) {
    throw new Error("Inventory integration tests require a loopback test database");
  }
  await mongoose.connect(uri, { autoIndex: false });
  const ownerId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const operation = "inventory-adjustment-test";
  const key = `inventory-${productId}`;
  const counterId = idempotencyIdentity(ownerId, operation, key);
  try {
    await Product.create({ _id: productId, owner: ownerId, name: "Inventory test fixture", sellingPrice: 10, stock: 3 });
    const createBatch = (code, date, quantity) => runFinancialTransaction((session) => addStockBatch({
      Product, StockBatch, ownerId, productId, session,
      batch: { batchCode: code, purchaseDate: new Date(date), quantityReceived: quantity },
    }));
    const first = await createBatch("FIRST", "2024-01-01", 4);
    const second = await createBatch("SECOND", "2024-02-01", 5);
    const items = [{ product: productId, quantity: 8 }];
    await runFinancialTransaction((session) => decrementStock({ Product, StockBatch, ownerId, items, session }));
    assert.equal(items[0].legacyQuantityFirst, 3);
    assert.deepEqual(items[0].batchAllocations.map((a) => [String(a.batch), a.quantity]), [[String(first.batch._id), 4], [String(second.batch._id), 1]]);
    assert.equal((await Product.findById(productId)).stock, 4);
    assert.equal((await StockBatch.findById(first.batch._id)).remainingQuantity, 0);
    assert.equal((await StockBatch.findById(second.batch._id)).remainingQuantity, 4);
    const returned = returnedBatchAllocations({ ...items[0], returnedQty: 0 }, 5);
    await runFinancialTransaction(async (session) => {
      await restoreBatchStock({ StockBatch, ownerId, productId, allocations: returned.allocations, session });
      await Product.updateOne({ _id: productId, owner: ownerId }, { $inc: { stock: 5 } }, { session });
    });
    assert.equal((await Product.findById(productId)).stock, 9);
    assert.equal((await StockBatch.findById(first.batch._id)).remainingQuantity, 2);

    await assert.rejects(runFinancialTransaction(async (session) => {
      await adjustStock({ Product, StockBatch, StockAdjustment, ownerId, productId, batchId: second.batch._id, delta: -2, reason: "rollback", session });
      throw new Error("injected inventory failure");
    }), /injected inventory failure/);
    assert.equal((await Product.findById(productId)).stock, 9);
    assert.equal((await StockBatch.findById(second.batch._id)).remainingQuantity, 4);
    assert.equal(await StockAdjustment.countDocuments({ owner: ownerId }), 0);
    const body = { delta: -1, reason: "count" };
    const execute = () => executeIdempotently({
      ownerId, operation, key, fingerprint: requestFingerprint(operation, {}, body),
      work: async (session) => {
        const result = await adjustStock({ Product, StockBatch, StockAdjustment, ownerId, productId, ...body, session });
        return { resultType: "stock-adjustment", resultId: result.adjustment._id, value: result.adjustment._id };
      },
      replay: async (record) => record.resultId,
    });
    const results = await Promise.all([execute(), execute()]);
    assert.equal(String(results[0]), String(results[1]));
    assert.equal((await Product.findById(productId)).stock, 8);
    assert.equal(await StockAdjustment.countDocuments({ owner: ownerId }), 1);
    await assert.rejects(runFinancialTransaction((session) => adjustStock({
      Product, StockBatch, StockAdjustment, ownerId: new mongoose.Types.ObjectId(), productId, ...body, session,
    })), /Product not found/);
  } finally {
    await StockAdjustment.deleteMany({ owner: ownerId });
    await StockBatch.deleteMany({ owner: ownerId });
    await Product.deleteOne({ _id: productId, owner: ownerId });
    await Counter.deleteOne({ _id: counterId });
    await mongoose.disconnect();
  }
});
