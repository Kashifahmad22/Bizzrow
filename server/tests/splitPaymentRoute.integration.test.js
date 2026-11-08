const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Customer = require("../models/Customer");
const Sale = require("../models/Sale");
const ReturnRecord = require("../models/ReturnRecord");
const LedgerEntry = require("../models/LedgerEntry");
const Counter = require("../models/Counter");
const { idempotencyIdentity, requestFingerprint } = require("../services/financialTransaction");
const { errorHandler } = require("../middleware/error");
const StockBatch = require("../models/StockBatch");
const StockAdjustment = require("../models/StockAdjustment");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("customer split payments and replacement tender use valid ledger methods", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  t.after(() => mongoose.disconnect());
  await connectIsolatedMongo(uri, [User, Product, StockBatch, StockAdjustment, Customer, Sale, ReturnRecord, LedgerEntry, Counter]);
  const ownerId = new mongoose.Types.ObjectId();
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();
  const app = express();
  app.use(express.json());
  app.use("/sales", require("../routes/sales"));
  app.use("/ledger", require("../routes/ledger"));
  app.use("/dashboard", require("../routes/dashboard"));
  app.use("/products", require("../routes/products"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const token = jwt.sign({ id: String(ownerId), tokenVersion: 0 }, process.env.JWT_SECRET);
  const keys = [];
  async function request(path, body, key) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json", "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.ok(response.ok, `HTTP ${response.status}: ${result.message}`);
    return result;
  }
  try {
    await User.create({
      _id: ownerId, name: "Route QA", email: `${ownerId}@example.invalid`,
      password: crypto.randomUUID(), preferences: { whatsappAutoInvoice: false },
    });
    const customer = await Customer.create({ owner: ownerId, name: "Route customer", phone: `qa-${ownerId}` });
    const product = await Product.create({ owner: ownerId, name: "Original", sellingPrice: 100, retailPrice: 100, stock: 5 });
    const replacement = await Product.create({ owner: ownerId, name: "Replacement", sellingPrice: 150, retailPrice: 150, stock: 5 });
    const saleBody = {
      customerType: "existing", customerId: String(customer._id), saleType: "retail",
      items: [{ productId: String(product._id), quantity: 1 }],
      payments: [{ method: "cash", amount: 40 }, { method: "upi", amount: 60 }],
    };
    const key = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, "sale-create", key));
    const first = await request("/sales", saleBody, key);
    const replay = await request("/sales", saleBody, key);
    assert.equal(first.sale._id, replay.sale._id);
    assert.equal(first.sale.amountPaid, 100);
    assert.deepEqual(first.sale.payments.map((entry) => [entry.method, entry.amount]), [["cash", 40], ["upi", 60]]);
    assert.equal((await LedgerEntry.findOne({ owner: ownerId, type: "payment" })).paymentMethod, "split");
    assert.equal((await Product.findById(product._id)).stock, 4);
    const collection = (await request("/dashboard/summary")).collection.today;
    assert.equal(collection.cash, 40);
    assert.equal(collection.upi, 60);
    assert.equal(collection.total, 100);

    const replacementKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `sale-replace:${first.sale._id}`, replacementKey));
    const replacementBody = {
      returnItems: [{ productId: String(product._id), quantity: 1 }],
      newItems: [{ productId: String(replacement._id), quantity: 1 }],
      payments: [{ method: "upi", amount: 50 }],
    };
    const result = await request(`/sales/${first.sale._id}/replace`, replacementBody, replacementKey);
    const replacementReplay = await request(`/sales/${first.sale._id.toUpperCase()}/replace`, replacementBody, replacementKey);
    assert.equal(result.newSale._id, replacementReplay.newSale._id);
    assert.equal(await ReturnRecord.countDocuments({ owner: ownerId, sale: first.sale._id, type: "replacement" }), 1);
    assert.equal(result.newSale.creditApplied, 100);
    assert.equal(result.newSale.amountPaid, 50);
    assert.equal(result.newSale.dueAmount, 0);
    const replacementPayment = await LedgerEntry.findOne({ owner: ownerId, reference: result.newSale._id, type: "payment" });
    assert.equal(replacementPayment.paymentMethod, "upi");
    const afterReplacement = (await request("/dashboard/summary")).collection;
    assert.equal(afterReplacement.historicalIncomplete, false);
    assert.equal(afterReplacement.today.cash, 40);
    assert.equal(afterReplacement.today.upi, 110);
    assert.equal(afterReplacement.today.total, 150);
    const analytics = await request("/dashboard/analytics?metric=collection");
    assert.equal(analytics.total, 150);
    assert.equal(analytics.trend.reduce((sum, day) => sum + day.collected, 0), 150);

    const secondKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, "sale-create", secondKey));
    const second = await request("/sales", saleBody, secondKey);
    const returnKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `sale-return:${second.sale._id}`, returnKey));
    await request(`/sales/${second.sale._id}/return`, {
      items: [{ productId: String(product._id), quantity: 1 }],
    }, returnKey);
    const afterReturn = (await request("/dashboard/summary")).collection.today;
    assert.equal(afterReturn.cash, 40);
    assert.equal(afterReturn.upi, 110);
    assert.equal(afterReturn.total, 150);

    const unpaidKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, "sale-create", unpaidKey));
    await request("/sales", { ...saleBody, payments: [] }, unpaidKey);
    const paymentKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `ledger-payment:${customer._id}`, paymentKey));
    await request(`/ledger/${customer._id}/payment`, { amount: 25, paymentMethod: "bank" }, paymentKey);
    const afterLedger = (await request("/dashboard/summary")).collection.today;
    assert.equal(afterLedger.bank, 25);
    assert.equal(afterLedger.total, 175);
    await Sale.create({
      owner: ownerId, customerName: "Historical customer", total: 7, amountPaid: 7,
      paymentMethod: "cash", payments: [{ method: "cash", amount: 7 }],
    });
    const historicalSummary = (await request("/dashboard/summary")).collection;
    assert.equal(historicalSummary.historicalIncomplete, true);
    assert.equal(historicalSummary.today.total, 182);
    assert.equal((await request("/dashboard/analytics?metric=collection")).historicalIncomplete, true);

    const isolatedCustomer = await Customer.create({
      _id: "abcdefabcdefabcdefabcdef", owner: ownerId, name: "Retry customer", phone: `retry-${ownerId}`,
    });
    const retrySaleKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, "sale-create", retrySaleKey));
    const retrySale = await request("/sales", {
      customerType: "existing", customerId: String(isolatedCustomer._id), saleType: "retail",
      items: [{ productId: String(product._id), quantity: 2 }], payments: [],
    }, retrySaleKey);
    const customerId = String(isolatedCustomer._id);
    const paymentKey2 = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `ledger-payment:${customerId}`, paymentKey2));
    const paymentBody = { amount: 10, paymentMethod: "cash" };
    const [paymentA, paymentB] = await Promise.all([
      request(`/ledger/${customerId}/payment`, paymentBody, paymentKey2),
      request(`/ledger/${customerId.toUpperCase()}/payment`, paymentBody, paymentKey2),
    ]);
    assert.equal(paymentA.entry._id, paymentB.entry._id);
    assert.equal((await request(`/ledger/${customerId}/payment`, paymentBody, paymentKey2)).entry._id, paymentA.entry._id);
    assert.equal(await LedgerEntry.countDocuments({ owner: ownerId, customer: customerId, type: "payment" }), 1);
    assert.equal((await Customer.findById(customerId)).pendingBalance, 190);
    assert.equal((await Sale.findById(retrySale.sale._id)).dueAmount, 190);
    const changed = await fetch(`http://127.0.0.1:${server.address().port}/ledger/${customerId.toUpperCase()}/payment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": paymentKey2 },
      body: JSON.stringify({ ...paymentBody, amount: 11 }),
    });
    assert.equal(changed.status, 409);

    const retrySaleId = retrySale.sale._id;
    const returnKey2 = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `sale-return:${retrySaleId}`, returnKey2));
    const returnBody = { items: [{ productId: String(product._id), quantity: 1 }] };
    const [returnA, returnB] = await Promise.all([
      request(`/sales/${retrySaleId}/return`, returnBody, returnKey2),
      request(`/sales/${retrySaleId.toUpperCase()}/return`, returnBody, returnKey2),
    ]);
    assert.equal(returnA.record._id, returnB.record._id);
    assert.equal((await request(`/sales/${retrySaleId}/return`, returnBody, returnKey2)).record._id, returnA.record._id);
    assert.equal(await ReturnRecord.countDocuments({ owner: ownerId, sale: retrySaleId }), 1);
    assert.equal((await Sale.findById(retrySaleId)).items[0].returnedQty, 1);
    assert.equal((await Product.findById(product._id)).stock, 3);
    assert.equal((await Customer.findById(customerId)).pendingBalance, 90);

    const legacyId = "AbCdEfAbCdEfAbCdEfAbCdEf";
    const legacyKey = crypto.randomUUID();
    const legacyCounterId = idempotencyIdentity(ownerId, `ledger-payment:${legacyId}`, legacyKey);
    const canonicalCounterId = idempotencyIdentity(ownerId, `ledger-payment:${customerId}`, legacyKey);
    keys.push(legacyCounterId, canonicalCounterId);
    await Counter.create({
      _id: legacyCounterId, seq: 0,
      requestHash: requestFingerprint("ledger:payment", { customerId: legacyId }, paymentBody),
      resultType: "ledger-payment", resultId: paymentA.entry._id, relatedResourceId: customerId,
    });
    assert.equal((await request(`/ledger/${customerId.toUpperCase()}/payment`, paymentBody, legacyKey)).entry._id, paymentA.entry._id);
    assert.equal((await Customer.findById(customerId)).pendingBalance, 90);
    const changedLegacy = await fetch(`http://127.0.0.1:${server.address().port}/ledger/${customerId}/payment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": legacyKey },
      body: JSON.stringify({ ...paymentBody, amount: 11 }),
    });
    assert.equal(changedLegacy.status, 409);
    await Counter.create({
      _id: canonicalCounterId, seq: 0,
      requestHash: requestFingerprint("ledger:payment", { customerId }, paymentBody),
      resultType: "ledger-payment", resultId: paymentA.entry._id, relatedResourceId: customerId,
    });
    const ambiguous = await fetch(`http://127.0.0.1:${server.address().port}/ledger/${customerId}/payment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": legacyKey },
      body: JSON.stringify(paymentBody),
    });
    assert.equal(ambiguous.status, 409);
    assert.equal((await Customer.findById(customerId)).pendingBalance, 90);
    const invalid = await fetch(`http://127.0.0.1:${server.address().port}/ledger/invalid/payment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(paymentBody),
    });
    assert.equal(invalid.status, 400);

    const inventoryProduct = await Product.create({
      _id: "fedcbafedcbafedcbafedcba", owner: ownerId, name: "Retry inventory", sellingPrice: 10, stock: 0,
    });
    const inventoryId = String(inventoryProduct._id);
    const batchKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `stock-batch:${inventoryId}`, batchKey));
    const batchBody = { quantityReceived: 3, batchCode: "retry-batch" };
    const batch = await request(`/products/${inventoryId}/batches`, batchBody, batchKey);
    const batchReplay = await request(`/products/${inventoryId.toUpperCase()}/batches`, batchBody, batchKey);
    assert.equal(batch.batch._id, batchReplay.batch._id);
    assert.equal(await StockBatch.countDocuments({ owner: ownerId, product: inventoryId }), 1);
    const adjustmentKey = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, `stock-adjustment:${inventoryId}`, adjustmentKey));
    const adjustmentBody = { delta: 1, reason: "count" };
    const adjustment = await request(`/products/${inventoryId}/stock-adjustments`, adjustmentBody, adjustmentKey);
    const adjustmentReplay = await request(`/products/${inventoryId.toUpperCase()}/stock-adjustments`, adjustmentBody, adjustmentKey);
    assert.equal(adjustment.adjustment._id, adjustmentReplay.adjustment._id);
    assert.equal(await StockAdjustment.countDocuments({ owner: ownerId, product: inventoryId }), 1);
    assert.equal((await Product.findById(inventoryId)).stock, 4);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await ReturnRecord.deleteMany({ owner: ownerId });
    await StockAdjustment.deleteMany({ owner: ownerId });
    await StockBatch.deleteMany({ owner: ownerId });
    await LedgerEntry.deleteMany({ owner: ownerId });
    await Sale.deleteMany({ owner: ownerId });
    await Product.deleteMany({ owner: ownerId });
    await Customer.deleteMany({ owner: ownerId });
    await User.deleteOne({ _id: ownerId });
    await Counter.deleteMany({ _id: { $in: [...keys, `invoice:${ownerId}:${new Date().getFullYear()}`] } });
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await mongoose.disconnect();
  }
});
