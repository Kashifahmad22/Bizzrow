const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");
const StockAdjustment = require("../models/StockAdjustment");
const Sale = require("../models/Sale");
const ReturnRecord = require("../models/ReturnRecord");
const LedgerEntry = require("../models/LedgerEntry");
const Counter = require("../models/Counter");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");
const { idempotencyIdentity, requestFingerprint } = require("../services/financialTransaction");
const { errorHandler } = require("../middleware/error");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("financial integrity routes use isolated transactional fixtures", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  t.after(() => mongoose.disconnect());
  await connectIsolatedMongo(uri, [User, Customer, Product, StockBatch, StockAdjustment, Sale, ReturnRecord, LedgerEntry, Counter]);
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const owner = new mongoose.Types.ObjectId();
  const otherOwner = new mongoose.Types.ObjectId();
  await User.create({ _id: owner, name: "Test", email: `${owner}@example.invalid`, password: crypto.randomUUID() });
  const app = express();
  app.use(express.json());
  app.use("/customers", require("../routes/customers"));
  app.use("/sales", require("../routes/sales"));
  app.use("/ledger", require("../routes/ledger"));
  app.use("/dashboard", require("../routes/dashboard"));
  app.use("/products", require("../routes/products"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const token = jwt.sign({ id: String(owner), tokenVersion: 0 }, process.env.JWT_SECRET);
  async function request(path, { method = "GET", body, key = crypto.randomUUID() } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  const customer = (name) => Customer.create({ owner, name, phone: crypto.randomUUID() });

  await t.test("fractional sales, returns and replacement totals round consistently", async () => {
    const buyer = await customer("decimal-money");
    const product = await Product.create({ owner, name: "One rupee", sellingPrice: 1, stock: 5 });
    const created = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "wholesale",
      items: [{ productId: String(product._id), quantity: 1.005 }], expectedTotal: 1.01,
      payments: [{ method: "cash", amount: 1.01 }],
    } });
    assert.equal(created.status, 201, created.data.message);
    assert.equal(created.data.sale.total, 1.01);
    const returned = await request(`/sales/${created.data.sale._id}/return`, {
      method: "POST", body: { items: [{ productId: String(product._id), quantity: 0.145 }] },
    });
    assert.equal(returned.status, 200, returned.data.message);
    assert.equal(returned.data.refund, 0.15);
    const replaced = await request(`/sales/${created.data.sale._id}/replace`, { method: "POST", body: {
      returnItems: [{ productId: String(product._id), quantity: 0.145 }],
      newItems: [{ productId: String(product._id), quantity: 1.015 }], payments: [],
    } });
    assert.equal(replaced.status, 200, replaced.data.message);
    assert.equal(replaced.data.replacementAmount, 1.02);
    assert.equal(replaced.data.refund, 0.14);
    assert.equal(replaced.data.priceDifference, 0.88);
  });

  await t.test("verified historical floating-point artifacts can be settled without over-return", async () => {
    const buyer = await customer("artifact");
    const product = await Product.create({ owner, name: "Artifact", sellingPrice: 1, stock: 0.3, soldCount: 0.7 });
    const batch = await StockBatch.create({
      owner, product: product._id, batchCode: "artifact", purchaseDate: new Date("2024-01-01"),
      quantityReceived: 1, remainingQuantity: 0.3,
    });
    const sale = await Sale.create({
      owner, customer: buyer._id, customerName: buyer.name, total: 1, amountPaid: 0.7, dueAmount: 0,
      returnedAmount: 0.3, paymentMethod: "cash", payments: [{ method: "cash", amount: 0.7 }],
      items: [{ product: product._id, name: product.name, quantity: 1, returnedQty: 0.30000000000000004,
        unitPrice: 1, subtotal: 1, batchAllocations: [{ batch: batch._id, quantity: 1 }] }],
    });
    for (const [index, quantity] of [0.1, 0.2].entries()) {
      await ReturnRecord.create({
        owner, sale: sale._id, customer: buyer._id, items: [{ product: product._id, quantity }],
        createdAt: new Date(2024, 0, index + 1),
      });
    }
    const path = `/sales/${sale._id}/return`;
    const body = (quantity) => ({ items: [{ productId: String(product._id), quantity }] });
    assert.equal((await request(path, { method: "POST", body: body(0.701) })).status, 400);
    assert.equal((await Sale.findById(sale._id)).items[0].returnedQty, 0.30000000000000004);
    const key = crypto.randomUUID();
    const partial = await request(path, { method: "POST", body: body(0.2), key });
    assert.equal(partial.status, 200, partial.data.message);
    assert.equal(partial.data.record.quantityReconciliations[0].storedReturnedQty, 0.30000000000000004);
    assert.equal(partial.data.record.quantityReconciliations[0].verifiedReturnedQty, 0.3);
    assert.equal((await request(path, { method: "POST", body: body(0.2), key })).data.record._id, partial.data.record._id);
    const final = await request(path, { method: "POST", body: body(0.5) });
    assert.equal(final.status, 200, final.data.message);
    assert.equal((await Sale.findById(sale._id)).items[0].returnedQty, 1);
    assert.equal((await Product.findById(product._id)).stock, 1);
    assert.equal((await StockBatch.findById(batch._id)).remainingQuantity, 1);
    assert.equal((await request(path, { method: "POST", body: body(0.001) })).status, 400);

    const unverified = await Sale.create({
      owner, customer: buyer._id, customerName: buyer.name, total: 1, amountPaid: 0.7, returnedAmount: 0.3,
      items: [{ product: product._id, name: product.name, quantity: 1, returnedQty: 0.30000000000000004,
        unitPrice: 1, subtotal: 1 }],
    });
    const rejected = await request(`/sales/${unverified._id}/return`, { method: "POST", body: body(0.7) });
    assert.equal(rejected.status, 409);
    assert.match(rejected.data.message, /reconcile/i);
    assert.equal((await Sale.findById(unverified._id)).items[0].returnedQty, 0.30000000000000004);
  });

  await t.test("legacy batch replay precedes validation and new responses remain stable", async () => {
    const product = await Product.create({ owner, name: "Legacy batch", sellingPrice: 1, stock: 1.23456 });
    const batch = await StockBatch.create({
      owner, product: product._id, batchCode: "legacy", purchaseDate: new Date("2024-01-01"),
      quantityReceived: 1.23456, remainingQuantity: 1.23456,
    });
    const key = crypto.randomUUID();
    const id = String(product._id);
    const body = { quantityReceived: 1.23456, batchCode: "legacy" };
    await Counter.create({
      _id: idempotencyIdentity(owner, `stock-batch:${id.toUpperCase()}`, key),
      requestHash: requestFingerprint("product:batch", { productId: id.toUpperCase() }, body),
      resultType: "stock-batch", resultId: batch._id,
    });
    const replay = await request(`/products/${id}/batches`, { method: "POST", key, body });
    assert.equal(replay.status, 201, replay.data.message);
    assert.equal(replay.data.batch._id, String(batch._id));
    assert.equal((await request(`/products/${id}/batches`, { method: "POST", key, body: { ...body, quantityReceived: 1.23455 } })).status, 409);
    assert.equal((await request(`/products/${id}/batches`, { method: "POST", body })).status, 400);
    assert.equal(await StockBatch.countDocuments({ owner, product: product._id }), 1);

    const buyer = await customer("stable-replay");
    const saleProduct = await Product.create({ owner, name: "Replay sale", sellingPrice: 100, stock: 1 });
    const created = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "wholesale",
      items: [{ productId: String(saleProduct._id), quantity: 1 }], payments: [],
    } });
    assert.equal(created.status, 201, created.data.message);
    const paymentPath = `/ledger/${buyer._id}/payment`;
    const paymentKey = crypto.randomUUID();
    const paymentBody = { amount: 25, paymentMethod: "cash" };
    const first = await request(paymentPath, { method: "POST", key: paymentKey, body: paymentBody });
    assert.equal(first.status, 201, first.data.message);
    assert.equal(first.data.customer.pendingBalance, 75);
    assert.equal((await request(paymentPath, { method: "POST", body: { amount: 10 } })).status, 201);
    const repeated = await request(paymentPath, { method: "POST", key: paymentKey, body: paymentBody });
    assert.deepEqual(repeated.data, first.data);
    assert.equal((await Customer.findById(buyer._id)).pendingBalance, 65);
  });

  await t.test("fractional sale and historical FIFO returns preserve quantities and retry safely", async () => {
    const buyer = await customer("fractional");
    const product = await Product.create({ owner, name: "Fractional", sellingPrice: 100, stock: 2.23456, soldCount: 0 });
    const batch = await StockBatch.create({
      owner, product: product._id, batchCode: "historic", purchaseDate: new Date("2024-01-01"),
      quantityReceived: 2.23456, remainingQuantity: 2.23456,
    });
    const createSale = (quantity) => request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "wholesale",
      items: [{ productId: String(product._id), quantity }], payments: [],
    } });
    for (const q of [0.1, 0.02, 0.003]) {
      const created = await createSale(q);
      assert.equal(created.status, 201, created.data.message);
    }
    assert.equal((await createSale(0.0001)).status, 400);
    assert.equal((await Product.findById(product._id)).stock, 2.11156);
    assert.equal((await StockBatch.findById(batch._id)).remainingQuantity, 2.11156);

    const legacyProduct = await Product.create({ owner, name: "Historical", sellingPrice: 100, stock: 0.76544, soldCount: 1.23456 });
    const legacyBatch = await StockBatch.create({
      owner, product: legacyProduct._id, batchCode: "historic-return", purchaseDate: new Date("2023-01-01"),
      quantityReceived: 2, remainingQuantity: 0.76544,
    });
    const legacySale = await Sale.create({
      owner, customer: buyer._id, customerName: buyer.name, total: 123.46, amountPaid: 123.46, dueAmount: 0,
      paymentMethod: "cash", payments: [{ method: "cash", amount: 123.46 }],
      items: [{ product: legacyProduct._id, name: "Historical", quantity: 1.23456, unitPrice: 100,
        subtotal: 123.46, batchAllocations: [{ batch: legacyBatch._id, quantity: 1.23456 }] }],
    });
    const returned = (quantity, key = crypto.randomUUID()) => request(`/sales/${legacySale._id}/return`, {
      method: "POST", key, body: { items: [{ productId: String(legacyProduct._id), quantity }] },
    });
    const key = crypto.randomUUID();
    const first = await returned(0.23456, key);
    assert.equal(first.status, 200, first.data.message);
    assert.equal((await returned(0.23456, key)).data.record._id, first.data.record._id);
    assert.equal((await returned(1.001)).status, 400);
    const last = await returned(1);
    assert.equal(last.status, 200, last.data.message);
    assert.equal((await returned(0.001)).status, 400);
    assert.equal((await Sale.findById(legacySale._id)).items[0].returnedQty, 1.23456);
    assert.equal((await Product.findById(legacyProduct._id)).stock, 2);
    assert.equal((await StockBatch.findById(legacyBatch._id)).remainingQuantity, 2);
    assert.equal(await ReturnRecord.countDocuments({ owner, sale: legacySale._id }), 2);

    const fullProduct = await Product.create({ owner, name: "Full historical", sellingPrice: 100, stock: 0, soldCount: 1.23456 });
    const fullBatch = await StockBatch.create({
      owner, product: fullProduct._id, batchCode: "historic-full", purchaseDate: new Date("2023-01-01"),
      quantityReceived: 1.23456, remainingQuantity: 0,
    });
    const fullSale = await Sale.create({
      owner, customer: buyer._id, customerName: buyer.name, total: 123.46, amountPaid: 123.46, dueAmount: 0,
      paymentMethod: "cash", payments: [{ method: "cash", amount: 123.46 }],
      items: [{ product: fullProduct._id, name: fullProduct.name, quantity: 1.23456, unitPrice: 100,
        subtotal: 123.46, batchAllocations: [{ batch: fullBatch._id, quantity: 1.23456 }] }],
    });
    const full = await request(`/sales/${fullSale._id}/return`, {
      method: "POST", body: { items: [{ productId: String(fullProduct._id), quantity: 1.23456 }] },
    });
    assert.equal(full.status, 200, full.data.message);
    assert.equal((await Product.findById(fullProduct._id)).stock, 1.23456);
    assert.equal((await StockBatch.findById(fullBatch._id)).remainingQuantity, 1.23456);

    const replacementProduct = await Product.create({ owner, name: "Replacement fraction", sellingPrice: 100, stock: 1 });
    const replacementSale = await Sale.create({
      owner, customer: buyer._id, customerName: buyer.name, total: 123.46, amountPaid: 123.46, dueAmount: 0,
      paymentMethod: "cash", payments: [{ method: "cash", amount: 123.46 }],
      items: [{ product: fullProduct._id, name: fullProduct.name, quantity: 1.23456, unitPrice: 100, subtotal: 123.46 }],
    });
    const invalidReplacement = await request(`/sales/${replacementSale._id}/replace`, { method: "POST", body: {
      returnItems: [{ productId: String(fullProduct._id), quantity: 1.23456 }],
      newItems: [{ productId: String(replacementProduct._id), quantity: 0.0001 }], payments: [],
    } });
    assert.equal(invalidReplacement.status, 400);
    assert.equal((await Sale.findById(replacementSale._id)).items[0].returnedQty, 0);
    const replacementResult = await request(`/sales/${replacementSale._id}/replace`, { method: "POST", body: {
      returnItems: [{ productId: String(fullProduct._id), quantity: 1.23456 }],
      newItems: [{ productId: String(replacementProduct._id), quantity: 0.125 }], payments: [],
    } });
    assert.equal(replacementResult.status, 200, replacementResult.data.message);
    assert.equal(replacementResult.data.newSale.items[0].quantity, 0.125);
    assert.equal((await Product.findById(replacementProduct._id)).stock, 0.875);

    const adjustment = await request(`/products/${product._id}/stock-adjustments`, {
      method: "POST", body: { delta: -0.001, batchId: String(batch._id), reason: "count" },
    });
    assert.equal(adjustment.status, 200, adjustment.data.message);
    assert.equal((await Product.findById(product._id)).stock, 2.11056);
    const invalidAdjustment = await request(`/products/${product._id}/stock-adjustments`, {
      method: "POST", body: { delta: -0.0001, reason: "count" },
    });
    assert.equal(invalidAdjustment.status, 400);
    const newBatch = await request(`/products/${product._id}/batches`, {
      method: "POST", body: { quantityReceived: 0.125, batchCode: "new-fraction" },
    });
    assert.equal(newBatch.status, 201, newBatch.data.message);
    assert.equal((await Product.findById(product._id)).stock, 2.23556);
    const invalidBatch = await request(`/products/${product._id}/batches`, {
      method: "POST", body: { quantityReceived: 0.0001, batchCode: "invalid" },
    });
    assert.equal(invalidBatch.status, 400);
    const invalidOpening = await request("/products", {
      method: "POST", body: { name: "Invalid opening", sellingPrice: 1, stock: 1.2345 },
    });
    assert.equal(invalidOpening.status, 400);

    const fifoProduct = await Product.create({ owner, name: "FIFO fractional", sellingPrice: 100, stock: 0.54567 });
    const fifoFirst = await StockBatch.create({
      owner, product: fifoProduct._id, batchCode: "fifo-first", purchaseDate: new Date("2022-01-01"),
      quantityReceived: 0.2, remainingQuantity: 0.2,
    });
    const fifoSecond = await StockBatch.create({
      owner, product: fifoProduct._id, batchCode: "fifo-second", purchaseDate: new Date("2023-01-01"),
      quantityReceived: 0.34567, remainingQuantity: 0.34567,
    });
    const fifoSale = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "wholesale",
      items: [{ productId: String(fifoProduct._id), quantity: 0.3 }], payments: [],
    } });
    assert.equal(fifoSale.status, 201, fifoSale.data.message);
    assert.equal((await StockBatch.findById(fifoFirst._id)).remainingQuantity, 0);
    assert.equal((await StockBatch.findById(fifoSecond._id)).remainingQuantity, 0.24567);
    const fifoReturn = await request(`/sales/${fifoSale.data.sale._id}/return`, {
      method: "POST", body: { items: [{ productId: String(fifoProduct._id), quantity: 0.3 }] },
    });
    assert.equal(fifoReturn.status, 200, fifoReturn.data.message);
    assert.equal((await StockBatch.findById(fifoFirst._id)).remainingQuantity, 0.2);
    assert.equal((await StockBatch.findById(fifoSecond._id)).remainingQuantity, 0.34567);
    assert.equal((await Product.findById(fifoProduct._id)).stock, 0.54567);

    const huge = await Product.create({ owner, name: "Unrepresentable", sellingPrice: 100, stock: 1000000000000000 });
    const unsafe = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "wholesale",
      items: [{ productId: String(huge._id), quantity: 0.001 }], payments: [],
    } });
    assert.equal(unsafe.status, 409);
    assert.match(unsafe.data.message, /cannot be represented safely/);
    assert.equal((await Product.findById(huge._id)).stock, 1000000000000000);
    assert.equal(await Sale.exists({ owner, "items.product": huge._id }), null);
  });

  await t.test("customer deletion rejects sales, ledger, returns and nonzero balances", async () => {
    const empty = await customer("empty");
    assert.equal((await request(`/customers/${empty._id}`, { method: "DELETE" })).status, 200);
    for (const kind of ["sale", "ledger", "return", "balance"]) {
      const target = await customer(kind);
      if (kind === "sale") await Sale.create({ owner, customer: target._id, customerName: kind, total: 0 });
      if (kind === "ledger") await LedgerEntry.create({ owner, customer: target._id, type: "adjustment", amount: 0, balanceAfter: 0 });
      if (kind === "return") await ReturnRecord.create({ owner, customer: target._id, sale: new mongoose.Types.ObjectId() });
      if (kind === "balance") await Customer.updateOne({ _id: target._id }, { $set: { pendingBalance: 1 } });
      const result = await request(`/customers/${target._id}`, { method: "DELETE" });
      assert.equal(result.status, 409);
      assert.match(result.data.message, /financial history|balance/i);
      assert.ok(await Customer.exists({ _id: target._id }));
    }
    const foreign = await Customer.create({ owner: otherOwner, name: "other", phone: crypto.randomUUID() });
    assert.equal((await request(`/customers/${foreign._id}`, { method: "DELETE" })).status, 404);
  });

  await t.test("concurrent checkout and customer deletion cannot leave a sale without its customer", async () => {
    const product = await Product.create({ owner, name: "Concurrent", sellingPrice: 10, stock: 10 });
    for (let i = 0; i < 4; i += 1) {
      const target = await customer("concurrent");
      const [deleted, sold] = await Promise.all([
        request(`/customers/${target._id}`, { method: "DELETE" }),
        request("/sales", { method: "POST", body: {
          customerType: "existing", customerId: String(target._id),
          items: [{ productId: String(product._id), quantity: 1 }],
        } }),
      ]);
      assert.ok(deleted.status === 200 || deleted.status === 409);
      assert.ok(sold.status === 201 || sold.status === 404);
      assert.notEqual(deleted.status === 200 && sold.status === 201, true);
      if (sold.status === 201) assert.ok(await Customer.exists({ _id: target._id }));
      if (deleted.status === 200) assert.equal(await Sale.exists({ owner, customer: target._id }), null);
    }
  });

  await t.test("collection totals include all records, not only the first 100 per category", async () => {
    const when = new Date("2024-06-15T12:00:00Z");
    const outside = new Date("2024-07-15T12:00:00Z");
    const target = await customer("analytics");
    const sales = Array.from({ length: 105 }, () => ({
      owner, customerName: "Analytics", total: 10, amountPaid: 10,
      collectionPayments: [{ method: "cash", amount: 10, source: "sale" }], createdAt: when,
    }));
    const created = await Sale.insertMany(sales);
    await LedgerEntry.insertMany(Array.from({ length: 105 }, () => ({
      owner, customer: target._id, type: "payment", amount: -2, balanceAfter: 0,
      collectionSource: "ledger", paymentMethod: "upi", createdAt: when,
    })));
    await ReturnRecord.insertMany(Array.from({ length: 105 }, (_, index) => ({
      owner, customer: target._id, sale: created[index]._id, cashRefund: 1, createdAt: when,
      refundPayments: [{ method: "cash", amount: 1, source: "sale" }],
    })));
    await Sale.create({ owner, customerName: "Outside", total: 100, amountPaid: 100, collectionPayments: [{ method: "cash", amount: 100 }], createdAt: outside });
    await Sale.create({ owner: otherOwner, customerName: "Other", total: 999, amountPaid: 999, collectionPayments: [{ method: "cash", amount: 999 }], createdAt: when });
    await Sale.collection.insertOne({
      owner, customerName: "Legacy", total: 5, amountPaid: 5, paymentMethod: "cash",
      collectionPayments: null, createdAt: when,
    });
    const june = await request("/dashboard/analytics?metric=collection&from=2024-06-01&to=2024-06-30");
    assert.equal(june.status, 200);
    assert.equal(june.data.total, 1160);
    assert.equal(june.data.records.length, 300);
    const july = await request("/dashboard/analytics?metric=collection&from=2024-07-01&to=2024-07-31");
    assert.equal(july.data.total, 100);
  });

  await t.test("replacement status, refund history, replay and paise validation", async () => {
    const buyer = await customer("replacement");
    const old = await Product.create({ owner, name: "Old", sellingPrice: 100, retailPrice: 100, stock: 10 });
    const replacement = await Product.create({ owner, name: "New", sellingPrice: 150, retailPrice: 150, stock: 10 });
    for (const [extra, expectedStatus, expectedDue] of [[0, "partial", 50], [20, "partial", 30], [50, "paid", 0]]) {
      const created = await request("/sales", { method: "POST", body: {
        customerType: "existing", customerId: String(buyer._id), saleType: "retail",
        items: [{ productId: String(old._id), quantity: 1 }], payments: [{ method: "cash", amount: 100 }],
      } });
      assert.equal(created.status, 201);
      const saleId = created.data.sale._id;
      const key = crypto.randomUUID();
      const body = {
        returnItems: [{ productId: String(old._id), quantity: 1 }],
        newItems: [{ productId: String(replacement._id), quantity: 1 }],
        payments: extra ? [{ method: "cash", amount: extra }] : [],
      };
      const result = await request(`/sales/${saleId}/replace`, { method: "POST", body, key });
      assert.equal(result.status, 200, result.data.message);
      assert.equal(result.data.newSale.paymentStatus, expectedStatus);
      assert.equal(result.data.newSale.dueAmount, expectedDue);
      const replay = await request(`/sales/${saleId}/replace`, { method: "POST", body, key });
      assert.equal(replay.data.record._id, result.data.record._id);
      const history = await LedgerEntry.find({ owner, customer: buyer._id, reference: saleId, type: "return" });
      assert.equal(history.length, 1);
      assert.equal(history[0].amount, 0);
      assert.match(history[0].note, /payment released for replacement settlement: 100.00/);
    }
    const invalid = await request(`/ledger/${buyer._id}/payment`, { method: "POST", body: { amount: 1.005 } });
    assert.equal(invalid.status, 400);
    const valid = await request(`/ledger/${buyer._id}/payment`, { method: "POST", body: { amount: "1.00" } });
    assert.equal(valid.status, 201, valid.data.message);
    const invalidSale = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id),
      items: [{ productId: String(old._id), quantity: 1, unitPrice: 1.005 }],
    } });
    assert.equal(invalidSale.status, 400);
    const unpaid = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "retail",
      items: [{ productId: String(old._id), quantity: 1 }], payments: [],
    } });
    const unpaidId = unpaid.data.sale._id;
    const replacementBody = {
      returnItems: [{ productId: String(old._id), quantity: 1 }],
      newItems: [{ productId: String(replacement._id), quantity: 1 }],
      payments: [{ method: "cash", amount: 1.005 }],
    };
    const badReplacement = await request(`/sales/${unpaidId}/replace`, { method: "POST", body: replacementBody });
    assert.equal(badReplacement.status, 400);
    assert.equal((await Sale.findById(unpaidId)).items[0].returnedQty, 0);
    const unpaidReplacement = await request(`/sales/${unpaidId}/replace`, {
      method: "POST", body: { ...replacementBody, payments: [] },
    });
    assert.equal(unpaidReplacement.data.newSale.paymentStatus, "unpaid");
    assert.equal(unpaidReplacement.data.newSale.dueAmount, 150);

    const paidSale = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "retail",
      items: [{ productId: String(old._id), quantity: 1 }], payments: [{ method: "cash", amount: 100 }],
    } });
    const returned = await request(`/sales/${paidSale.data.sale._id}/return`, {
      method: "POST", body: { items: [{ productId: String(old._id), quantity: 1 }] },
    });
    assert.equal(returned.status, 200);
    const refundEntry = await LedgerEntry.findOne({ owner, reference: paidSale.data.sale._id, type: "return" });
    assert.equal(refundEntry.amount, 0);
    assert.match(refundEntry.note, /payment refunded: 100.00/);
    const statement = await request(`/ledger/${buyer._id}/statement`);
    assert.ok(statement.data.statement.entries.some((entry) => entry.note.includes("payment refunded: 100.00")));

    const cheaper = await Product.create({ owner, name: "Cheaper", sellingPrice: 50, retailPrice: 50, stock: 1 });
    const original = await request("/sales", { method: "POST", body: {
      customerType: "existing", customerId: String(buyer._id), saleType: "retail",
      items: [{ productId: String(old._id), quantity: 1 }], payments: [{ method: "cash", amount: 100 }],
    } });
    const refundKey = crypto.randomUUID();
    const refundBody = {
      returnItems: [{ productId: String(old._id), quantity: 1 }],
      newItems: [{ productId: String(cheaper._id), quantity: 1 }], payments: [],
    };
    const cheaperResult = await request(`/sales/${original.data.sale._id}/replace`, { method: "POST", body: refundBody, key: refundKey });
    assert.equal(cheaperResult.status, 200);
    assert.equal(cheaperResult.data.record.cashRefund, 50);
    assert.equal(cheaperResult.data.newSale.creditApplied, 50);
    await request(`/sales/${original.data.sale._id}/replace`, { method: "POST", body: refundBody, key: refundKey });
    const refundEntries = await LedgerEntry.find({ owner, reference: original.data.sale._id, note: /Replacement refund paid/ });
    assert.equal(refundEntries.length, 1);
    assert.match(refundEntries[0].note, /50.00/);
    const creditEntry = await LedgerEntry.findOne({ owner, reference: cheaperResult.data.newSale._id, type: "adjustment" });
    assert.equal(creditEntry.amount, -50);
  });
});
