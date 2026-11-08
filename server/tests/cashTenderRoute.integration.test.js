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
const { idempotencyIdentity } = require("../services/financialTransaction");
const { errorHandler } = require("../middleware/error");
const StockBatch = require("../models/StockBatch");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("cash tender persists net collections through sales, retries, returns and replacement", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  t.after(() => mongoose.disconnect());
  await connectIsolatedMongo(uri, [User, Product, StockBatch, Customer, Sale, ReturnRecord, LedgerEntry, Counter]);
  const ownerId = new mongoose.Types.ObjectId();
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();
  const app = express();
  app.use(express.json());
  app.use("/sales", require("../routes/sales"));
  app.use("/dashboard", require("../routes/dashboard"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const token = jwt.sign({ id: String(ownerId), tokenVersion: 0 }, process.env.JWT_SECRET);
  const keys = [];
  function key(operation) {
    const value = crypto.randomUUID();
    keys.push(idempotencyIdentity(ownerId, operation, value));
    return value;
  }
  async function request(path, body, requestKey) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json", "Idempotency-Key": requestKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    await User.create({ _id: ownerId, name: "Cash test", email: `${ownerId}@example.invalid`,
      password: crypto.randomUUID(), preferences: { whatsappAutoInvoice: false } });
    const customer = await Customer.create({ owner: ownerId, name: "Customer", phone: `qa-${ownerId}` });
    const product = await Product.create({ owner: ownerId, name: "Item", sellingPrice: 141, retailPrice: 141, stock: 50 });
    const item = { productId: String(product._id), quantity: 2 };
    const base = { customerType: "existing", customerId: String(customer._id), saleType: "retail", items: [item] };
    const saleKey = key("sale-create");
    const body = { ...base, expectedTotal: 282, cashTendered: "300", payments: [{ method: "upi", amount: 10 }] };
    const first = await request("/sales", body, saleKey);
    assert.equal(first.status, 201);
    const id = first.data.sale._id;
    const replay = await request("/sales", body, saleKey);
    assert.equal(replay.status, 200);
    assert.equal(replay.data.sale._id, id);
    assert.equal((await request("/sales", { ...body, cashTendered: "301" }, saleKey)).status, 409);
    assert.equal(await Sale.countDocuments({ owner: ownerId }), 1);
    const persisted = await Sale.findById(id).lean();
    assert.equal(persisted.cashTendered, 300);
    assert.equal(persisted.cashChange, 28);
    assert.equal(persisted.amountPaid, 282);
    assert.equal(persisted.dueAmount, 0);
    assert.deepEqual(persisted.collectionPayments.map((p) => [p.method, p.amount]), [["cash", 272], ["upi", 10]]);
    const ledger = await LedgerEntry.find({ owner: ownerId, reference: id }).lean();
    assert.equal(ledger.length, 2);
    assert.equal(ledger.find((entry) => entry.type === "payment").amount, -282);
    assert.equal((await Customer.findById(customer._id)).pendingBalance, 0);
    let summary = (await request("/dashboard/summary")).data;
    assert.equal(summary.collection.today.cash, 272);
    assert.equal(summary.collection.today.upi, 10);
    assert.equal(summary.collection.today.total, 282);
    assert.equal(summary.summary.salesToday, 282);
    const invoice = (await request(`/sales/${id}/invoice`)).data.invoice;
    assert.equal(invoice.cashTendered, 300);
    assert.equal(invoice.cashChange, 28);

    const returnKey = key(`sale-return:${id}`);
    const returned = await request(`/sales/${id}/return`, {
      items: [{ productId: String(product._id), quantity: 1 }],
    }, returnKey);
    assert.equal(returned.status, 200);
    assert.equal(returned.data.record.refundAmount, 141);
    assert.equal(returned.data.record.cashRefund, 141);
    const afterReturn = await Sale.findById(id).lean();
    assert.equal(afterReturn.cashTendered, 300);
    assert.equal(afterReturn.cashChange, 28);
    assert.equal(afterReturn.amountPaid, 141);
    summary = (await request("/dashboard/summary")).data;
    assert.equal(summary.collection.today.total, 141);
    assert.equal(summary.summary.salesToday, 141);
    const fullReturn = await request(`/sales/${id}/return`, {
      items: [{ productId: String(product._id), quantity: 1 }],
    }, key(`sale-return:${id}`));
    assert.equal(fullReturn.status, 200);
    assert.equal((await Sale.findById(id)).amountPaid, 0);
    assert.equal((await Sale.findById(id)).cashChange, 28);
    assert.equal((await request("/dashboard/summary")).data.collection.today.total, 0);

    const partial = await request("/sales", { ...base, cashTendered: 250, payments: [] }, key("sale-create"));
    assert.equal(partial.status, 201);
    assert.equal(partial.data.sale.dueAmount, 32);
    assert.equal((await Customer.findById(customer._id)).pendingBalance, 32);
    const walkin = { customerType: "walkin", saleType: "retail", items: [item], cashTendered: 250, payments: [] };
    assert.equal((await request("/sales", walkin, key("sale-create"))).status, 400);
    assert.equal((await request("/sales", { ...base, cashTendered: 300, payments: [{ method: "upi", amount: 283 }] }, key("sale-create"))).status, 400);
    assert.equal((await request("/sales", { ...base, cashTendered: 300.001, payments: [] }, key("sale-create"))).status, 400);

    const original = await request("/sales", { ...base, cashTendered: 300, payments: [] }, key("sale-create"));
    assert.equal(original.status, 201);
    const originalId = original.data.sale._id;
    const replacement = await request(`/sales/${originalId}/replace`, {
      returnItems: [{ productId: String(product._id), quantity: 2 }],
      newItems: [item],
      payments: [],
    }, key(`sale-replace:${originalId}`));
    assert.equal(replacement.status, 200);
    assert.equal(replacement.data.newSale.creditApplied, 282);
    assert.equal(replacement.data.newSale.amountPaid, 0);
    assert.equal((await Sale.findById(originalId)).cashChange, 18);
    assert.equal((await Sale.findById(replacement.data.newSale._id)).cashTendered, undefined);

    for (const [tender, payments, expectedCash, expectedChange] of [
      [282, [], 282, 0],
      [300, [], 282, 18],
      [200, [{ method: "upi", amount: 82 }], 200, 0],
    ]) {
      const created = await request("/sales", { ...base, cashTendered: tender, payments }, key("sale-create"));
      assert.equal(created.status, 201);
      const saved = await Sale.findById(created.data.sale._id).lean();
      assert.equal(saved.collectionPayments.find((p) => p.method === "cash").amount, expectedCash);
      assert.equal(saved.cashChange, expectedChange);
      assert.equal(saved.amountPaid, 282);
      assert.equal(saved.dueAmount, 0);
    }

    const zero = await Product.create({ owner: ownerId, name: "Free item", sellingPrice: 0, retailPrice: 0, stock: 5 });
    const zeroBody = { ...base, items: [{ productId: String(zero._id), quantity: 1 }], payments: [] };
    assert.equal((await request("/sales", { ...zeroBody, cashTendered: 1 }, key("sale-create"))).status, 400);
    const freeSale = await request("/sales", zeroBody, key("sale-create"));
    assert.equal(freeSale.status, 201);
    assert.equal(freeSale.data.sale.amountPaid, 0);
    assert.equal(freeSale.data.sale.cashTendered, undefined);

    const concurrentKey = key("sale-create");
    const concurrentBody = { ...base, cashTendered: 282, payments: [] };
    const before = await Sale.countDocuments({ owner: ownerId });
    const concurrent = await Promise.all([
      request("/sales", concurrentBody, concurrentKey),
      request("/sales", concurrentBody, concurrentKey),
    ]);
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 201]);
    assert.equal(concurrent[0].data.sale._id, concurrent[1].data.sale._id);
    assert.equal(await Sale.countDocuments({ owner: ownerId }), before + 1);
    assert.equal(await LedgerEntry.countDocuments({ owner: ownerId, reference: concurrent[0].data.sale._id }), 2);

    const changedProduct = await Product.create({ owner: ownerId, name: "Changed price", sellingPrice: 141, retailPrice: 141, stock: 5 });
    const changedBody = {
      ...base, items: [{ productId: String(changedProduct._id), quantity: 2 }],
      expectedTotal: 282, cashTendered: 300, payments: [],
    };
    await Product.updateOne({ _id: changedProduct._id }, { $set: { retailPrice: 145 } });
    const mismatchKey = key("sale-create");
    const saleCount = await Sale.countDocuments({ owner: ownerId });
    const ledgerCount = await LedgerEntry.countDocuments({ owner: ownerId });
    const balance = (await Customer.findById(customer._id)).pendingBalance;
    const mismatch = await request("/sales", changedBody, mismatchKey);
    assert.equal(mismatch.status, 409);
    assert.match(mismatch.data.message, /reopen checkout/i);
    assert.equal(await Sale.countDocuments({ owner: ownerId }), saleCount);
    assert.equal(await LedgerEntry.countDocuments({ owner: ownerId }), ledgerCount);
    assert.equal((await Customer.findById(customer._id)).pendingBalance, balance);
    assert.equal((await Product.findById(changedProduct._id)).stock, 5);
    assert.equal(await Counter.findById(idempotencyIdentity(ownerId, "sale-create", mismatchKey)), null);
    const correctedBody = { ...changedBody, expectedTotal: 290 };
    const corrected = await request("/sales", correctedBody, mismatchKey);
    assert.equal(corrected.status, 201);
    assert.equal(corrected.data.sale.total, 290);
    assert.equal(corrected.data.sale.cashChange, 10);
    const correctedReplay = await request("/sales", correctedBody, mismatchKey);
    assert.equal(correctedReplay.status, 200);
    assert.equal(correctedReplay.data.sale._id, corrected.data.sale._id);
    assert.equal(await Sale.countDocuments({ owner: ownerId }), saleCount + 1);
    assert.equal((await Product.findById(changedProduct._id)).stock, 3);

    const legacyShapeWithExpectedTotal = {
      customerType: "existing", customerId: String(customer._id),
      items: [{ productId: String(changedProduct._id), quantity: 1, unitPrice: 1 }],
      expectedTotal: 1, payments: [],
    };
    const priceSpoof = await request("/sales", legacyShapeWithExpectedTotal, key("sale-create"));
    assert.equal(priceSpoof.status, 409);
    assert.equal((await Product.findById(changedProduct._id)).stock, 3);

    const [lineA, lineB] = await Product.create([
      { owner: ownerId, name: "Reviewed A", sellingPrice: 100, retailPrice: 100, stock: 5 },
      { owner: ownerId, name: "Reviewed B", sellingPrice: 182, retailPrice: 182, stock: 5 },
    ]);
    const lineItems = [
      { productId: String(lineA._id), quantity: 1 },
      { productId: String(lineB._id), quantity: 1 },
    ];
    const reviewedBody = {
      ...base, items: lineItems, expectedTotal: 282, payments: [],
      reviewedItems: [
        { ...lineItems[0], unitPrice: 100 },
        { ...lineItems[1], unitPrice: 182 },
      ],
    };
    const matching = await request("/sales", reviewedBody, key("sale-create"));
    assert.equal(matching.status, 201);
    assert.deepEqual(matching.data.sale.items.map((entry) => entry.unitPrice), [100, 182]);

    await Product.updateOne({ _id: lineA._id }, { $set: { retailPrice: 110 } });
    const singleChanged = await request("/sales", reviewedBody, key("sale-create"));
    assert.equal(singleChanged.status, 409);
    assert.match(singleChanged.data.message, /review the updated cart/i);
    await Product.updateOne({ _id: lineB._id }, { $set: { retailPrice: 172 } });
    const reviewedKey = key("sale-create");
    const countBeforeMismatch = await Sale.countDocuments({ owner: ownerId });
    const entriesBeforeMismatch = await LedgerEntry.countDocuments({ owner: ownerId });
    const customerBeforeMismatch = await Customer.findById(customer._id).lean();
    const rejected = await request("/sales", reviewedBody, reviewedKey);
    assert.equal(rejected.status, 409);
    assert.match(rejected.data.message, /review the updated cart/i);
    assert.equal(await Sale.countDocuments({ owner: ownerId }), countBeforeMismatch);
    assert.equal(await LedgerEntry.countDocuments({ owner: ownerId }), entriesBeforeMismatch);
    assert.equal((await Customer.findById(customer._id)).pendingBalance, customerBeforeMismatch.pendingBalance);
    assert.equal((await Product.findById(lineA._id)).stock, 4);
    assert.equal((await Product.findById(lineB._id)).stock, 4);
    assert.equal(await Counter.findById(idempotencyIdentity(ownerId, "sale-create", reviewedKey)), null);
    const correctedLines = [{ ...lineItems[0], unitPrice: 110 }, { ...lineItems[1], unitPrice: 172 }];
    const correctedReview = await request("/sales", { ...reviewedBody, reviewedItems: correctedLines }, reviewedKey);
    assert.equal(correctedReview.status, 201);
    assert.deepEqual(correctedReview.data.sale.items.map((entry) => entry.unitPrice), [110, 172]);
    assert.equal(correctedReview.data.sale.total, 282);

    const quantityMismatch = await request("/sales", {
      ...reviewedBody, reviewedItems: [{ ...correctedLines[0], quantity: 2 }, correctedLines[1]],
    }, key("sale-create"));
    assert.equal(quantityMismatch.status, 409);
    const duplicate = await request("/sales", {
      ...reviewedBody, reviewedItems: [correctedLines[0], correctedLines[0]],
    }, key("sale-create"));
    assert.equal(duplicate.status, 409);
    const duplicateItem = await request("/sales", {
      ...reviewedBody, items: [lineItems[0], lineItems[0]], reviewedItems: correctedLines,
    }, key("sale-create"));
    assert.equal(duplicateItem.status, 409);
    const unexpected = await request("/sales", {
      ...reviewedBody, reviewedItems: [correctedLines[0], { ...correctedLines[1], productId: String(product._id) }],
    }, key("sale-create"));
    assert.equal(unexpected.status, 409);

    const spoofWithReview = {
      customerType: "existing", customerId: String(customer._id),
      items: [{ productId: String(lineA._id), quantity: 1, unitPrice: 1 }],
      reviewedItems: [{ productId: String(lineA._id), quantity: 1, unitPrice: 1 }],
      payments: [],
    };
    assert.equal((await request("/sales", spoofWithReview, key("sale-create"))).status, 409);
    const tenderWithoutPricingFlags = {
      customerType: "existing", customerId: String(customer._id),
      items: [{ productId: String(lineA._id).toUpperCase(), quantity: 1, unitPrice: 1 }],
      cashTendered: 200, payments: [],
    };
    const tenderSale = await request("/sales", tenderWithoutPricingFlags, key("sale-create"));
    assert.equal(tenderSale.status, 201);
    assert.equal(tenderSale.data.sale.total, 100);
    assert.equal(tenderSale.data.sale.amountPaid, 100);
    assert.equal(tenderSale.data.sale.cashChange, 100);
    const legacy = { ...spoofWithReview };
    delete legacy.reviewedItems;
    const legacyResult = await request("/sales", legacy, key("sale-create"));
    assert.equal(legacyResult.status, 201);
    assert.equal(legacyResult.data.sale.total, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await ReturnRecord.deleteMany({ owner: ownerId });
    await LedgerEntry.deleteMany({ owner: ownerId });
    await Sale.deleteMany({ owner: ownerId });
    await Product.deleteMany({ owner: ownerId });
    await Customer.deleteMany({ owner: ownerId });
    await User.deleteOne({ _id: ownerId });
    await Counter.deleteMany({ _id: { $in: [...keys, `invoice:${ownerId}:${new Date().getFullYear()}`] } });
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    await mongoose.disconnect();
  }
});
