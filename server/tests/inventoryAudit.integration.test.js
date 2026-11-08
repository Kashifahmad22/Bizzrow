const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const RevokedSession = require("../models/RevokedSession");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const StockAdjustment = require("../models/StockAdjustment");
const InventoryAudit = require("../models/InventoryAudit");
const Counter = require("../models/Counter");
const { errorHandler } = require("../middleware/error");
const { runFinancialTransaction } = require("../services/financialTransaction");
const { decrementStock } = require("../services/stockService");
const { adjustStock } = require("../services/stockAdjustment");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("inventory audits reconcile sources transactionally, reject stale counts and isolate tenants", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  await connectIsolatedMongo(uri, [User, RevokedSession, Product, StockBatch, StockAdjustment, InventoryAudit, Counter]);
  t.after(() => mongoose.disconnect());
  process.env.JWT_SECRET = crypto.randomUUID();
  const owner = await User.create({ name: "Synthetic", email: `${crypto.randomUUID()}@example.invalid`, password: crypto.randomUUID() });
  const other = await User.create({ name: "Other", email: `${crypto.randomUUID()}@example.invalid`, password: crypto.randomUUID() });
  const product = await Product.create({ owner: owner._id, name: "Batched", sellingPrice: 1, stock: 10 });
  const second = await Product.create({ owner: owner._id, name: "Loose", sellingPrice: 1, stock: 2 });
  const legacy = await Product.create({ owner: owner._id, name: "Legacy precision", sellingPrice: 1, stock: 1.23456 });
  await Product.collection.updateOne({ _id: legacy._id }, { $unset: { stockRevision: "" } });
  const foreign = await Product.create({ owner: other._id, name: "Foreign", sellingPrice: 1, stock: 1 });
  const a = await StockBatch.create({ owner: owner._id, product: product._id, batchCode: "A", quantityReceived: 4, remainingQuantity: 4, purchaseDate: new Date("2024-01-01") });
  const b = await StockBatch.create({ owner: owner._id, product: product._id, batchCode: "B", quantityReceived: 3, remainingQuantity: 3, purchaseDate: new Date("2024-01-02") });
  const foreignBatch = await StockBatch.create({ owner: other._id, product: foreign._id, batchCode: "X", quantityReceived: 1, remainingQuantity: 1, purchaseDate: new Date("2024-01-01") });
  const token = jwt.sign({ id: String(owner._id), tokenVersion: 0 }, process.env.JWT_SECRET);
  const otherToken = jwt.sign({ id: String(other._id), tokenVersion: 0 }, process.env.JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use("/audits", require("../routes/inventoryAudits"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function request(path, { method = "GET", data, key, auth = token } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/audits${path}`, {
      method,
      headers: { ...(auth && { Authorization: `Bearer ${auth}` }), "Content-Type": "application/json", ...(key && { "Idempotency-Key": key }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, data: await response.json() };
  }
  async function create(ids = [String(product._id), String(second._id)]) {
    const result = await request("/", { method: "POST", data: { productIds: ids } });
    assert.equal(result.status, 201);
    return result.data.audit;
  }
  function counts(audit, changes = {}) {
    return { remarks: "Synthetic count", revision: audit.__v, items: audit.items.map((item) => ({
      product: item.product,
      sources: item.sources.map((source) => ({
        batch: source.batch,
        physicalQuantity: changes[source.batch || `${item.product}:loose`] ?? source.systemQuantity,
        reason: "Physical count",
      })),
    })) };
  }
  async function save(audit, data = counts(audit)) {
    const result = await request(`/${audit._id}`, { method: "PUT", data });
    assert.equal(result.status, 200);
    return result.data.audit;
  }
  const id = String(product._id);
  assert.equal((await request("/", { method: "POST", data: { productIds: [String(foreign._id)] } })).status, 404);
  const all = await request("/", { method: "POST", data: { allProducts: true } });
  assert.equal(all.status, 201);
  assert.equal(all.data.audit.items.length, 3);
  assert.ok(all.data.audit.items.every((item) => item.product !== String(foreign._id)));
  const audit = await create();
  assert.equal((await request(`/${audit._id}`, { auth: otherToken })).status, 404);
  assert.equal((await request(`/${audit._id}/approve`, { method: "POST", data: {}, key: crypto.randomUUID(), auth: null })).status, 401);
  const bad = counts(audit);
  const batchedItem = bad.items.find((item) => item.product === id);
  batchedItem.sources[0].batch = String(foreignBatch._id);
  assert.equal((await request(`/${audit._id}`, { method: "PUT", data: bad })).status, 400);
  const reviewed = await save(audit, counts(audit, { [String(a._id)]: 3, [String(b._id)]: 3, [`${id}:loose`]: 4 }));
  const key = crypto.randomUUID();
  const first = await request(`/${audit._id}/approve`, { method: "POST", data: { revision: reviewed.__v }, key });
  assert.equal(first.status, 200);
  assert.equal(first.data.audit.status, "completed");
  assert.equal((await Product.findById(product._id)).stock, 10);
  assert.equal((await StockBatch.findById(a._id)).remainingQuantity, 3);
  assert.equal(await StockAdjustment.countDocuments({ owner: owner._id, product: product._id }), 2);
  assert.equal((await request(`/${audit._id}/approve`, { method: "POST", data: { revision: reviewed.__v }, key })).status, 200);
  assert.equal((await request(`/${audit._id}/approve`, { method: "POST", data: { changed: true }, key })).status, 409);
  assert.equal((await request(`/${audit._id}/approve`, { method: "POST", data: {}, key: crypto.randomUUID() })).status, 409);
  const history = (await request(`/${audit._id}`)).data.audit;
  assert.equal(history.items.find((item) => item.product === id).systemStock, 10);
  assert.ok(history.completedAt);
  assert.equal(history.items.find((item) => item.product === id).sources.filter((source) => source.adjustment).length, 2);
  const match = await create([String(second._id)]);
  const reviewedMatch = await save(match);
  const concurrentKey = crypto.randomUUID();
  const simultaneous = await Promise.all([1, 2].map(() => request(`/${match._id}/approve`, {
    method: "POST", data: { revision: reviewedMatch.__v }, key: concurrentKey,
  })));
  assert.deepEqual(simultaneous.map((entry) => entry.status), [200, 200]);
  const competing = await create([String(second._id)]);
  const reviewedCompeting = await save(competing);
  const competingApprovals = await Promise.all([1, 2].map(() => request(`/${competing._id}/approve`, {
    method: "POST", data: { revision: reviewedCompeting.__v }, key: crypto.randomUUID(),
  })));
  assert.deepEqual(competingApprovals.map((entry) => entry.status).sort(), [200, 409]);
  const staleReview = await create([String(second._id)]);
  const oldReview = await save(staleReview);
  await save(oldReview);
  assert.equal((await request(`/${staleReview._id}/approve`, { method: "POST", data: { revision: oldReview.__v }, key: crypto.randomUUID() })).status, 409);
  const rollback = await create([id]);
  const reviewedRollback = await save(rollback, counts(rollback, { [String(a._id)]: 2, [String(b._id)]: 4 }));
  assert.equal((await request(`/${rollback._id}/approve`, { method: "POST", data: { revision: reviewedRollback.__v }, key: crypto.randomUUID() })).status, 409);
  assert.equal((await StockBatch.findById(a._id)).remainingQuantity, 3);
  assert.equal((await InventoryAudit.findById(rollback._id)).status, "draft");
  const staleSale = await create([id]);
  const reviewedSale = await save(staleSale);
  await runFinancialTransaction((session) => decrementStock({ Product, StockBatch, ownerId: owner._id,
    items: [{ product: product._id, quantity: 1 }], session }));
  assert.equal((await request(`/${staleSale._id}/approve`, { method: "POST", data: { revision: reviewedSale.__v }, key: crypto.randomUUID() })).status, 409);
  const staleAdjustment = await create([id]);
  const reviewedAdjustment = await save(staleAdjustment);
  await runFinancialTransaction((session) => adjustStock({ Product, StockBatch, StockAdjustment, ownerId: owner._id,
    productId: product._id, delta: 1, reason: "Synthetic adjustment", session }));
  assert.equal((await request(`/${staleAdjustment._id}/approve`, { method: "POST", data: { revision: reviewedAdjustment.__v }, key: crypto.randomUUID() })).status, 409);
  const sameStock = await create([String(second._id)]);
  const reviewedSameStock = await save(sameStock);
  await runFinancialTransaction((session) => decrementStock({ Product, StockBatch, ownerId: owner._id,
    items: [{ product: second._id, quantity: 1 }], session }));
  await runFinancialTransaction((session) => adjustStock({ Product, StockBatch, StockAdjustment, ownerId: owner._id,
    productId: second._id, delta: 1, reason: "Synthetic restoration", session }));
  assert.equal((await Product.findById(second._id)).stock, 2);
  assert.equal((await request(`/${sameStock._id}/approve`, { method: "POST", data: { revision: reviewedSameStock.__v }, key: crypto.randomUUID() })).status, 409);
  const historical = await create([String(legacy._id)]);
  const reviewedHistorical = await save(historical, counts(historical, { [`${legacy._id}:loose`]: 1.23356 }));
  assert.equal((await request(`/${historical._id}/approve`, { method: "POST", data: { revision: reviewedHistorical.__v }, key: crypto.randomUUID() })).status, 200);
  assert.equal((await Product.findById(legacy._id)).stock, 1.23356);
});
