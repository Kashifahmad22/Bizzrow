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
const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const LedgerEntry = require("../models/LedgerEntry");
const ReturnRecord = require("../models/ReturnRecord");
const Counter = require("../models/Counter");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");
const { errorHandler } = require("../middleware/error");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("Tatkal product creation is owner-scoped, idempotent and usable in a transactional sale", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  await connectIsolatedMongo(uri, [
    User, RevokedSession, Product, StockBatch, StockAdjustment, Sale, Customer, LedgerEntry, ReturnRecord, Counter,
  ]);
  t.after(() => mongoose.disconnect());

  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  const owner = await User.create({
    name: "Synthetic Owner",
    email: `${crypto.randomUUID()}@example.invalid`,
    password: crypto.randomUUID(),
  });
  const otherOwner = await User.create({
    name: "Other Synthetic Owner",
    email: `${crypto.randomUUID()}@example.invalid`,
    password: crypto.randomUUID(),
  });
  const tokenFor = (user) => jwt.sign({ id: String(user._id), tokenVersion: 0 }, process.env.JWT_SECRET);
  const ownerToken = tokenFor(owner);
  const otherToken = tokenFor(otherOwner);

  const app = express();
  app.use(express.json());
  app.use("/products", require("../routes/products"));
  app.use("/sales", require("../routes/sales"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  async function request(path, { method = "GET", body, key, token = ownerToken } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        "Content-Type": "application/json",
        ...(key && { "Idempotency-Key": key }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }

  const body = {
    tatkal: true,
    name: "Tatkal Synthetic Product",
    quantity: 5,
    sellingPrice: 20,
  };
  assert.equal((await request("/products", { method: "POST", body, token: null })).status, 401);
  assert.equal((await request("/products", { method: "POST", body: { ...body, owner: String(otherOwner._id) } })).status, 400);
  assert.equal((await request("/products", { method: "POST", body: { ...body, quantity: { value: 5 } } })).status, 400);
  assert.equal((await request("/products", { method: "POST", body: { ...body, costPrice: 4 } })).status, 400);
  assert.equal((await request("/products", { method: "POST", body })).status, 400);
  assert.equal(await Product.countDocuments(), 0);

  const productKey = crypto.randomUUID();
  const created = await request("/products", { method: "POST", body, key: productKey });
  assert.equal(created.status, 201, created.data.message);
  const product = created.data.product;
  assert.equal(product.name, body.name);
  assert.equal(product.stock, 5);
  assert.equal(product.wholesalePrice, 20);
  assert.equal(product.retailPrice, 20);
  assert.equal(product.costPrice, null);
  assert.equal(product.marginPct, null);

  const replay = await request("/products", { method: "POST", body, key: productKey });
  assert.equal(replay.status, 201);
  assert.equal(replay.data.product._id, product._id);
  assert.equal(await Product.countDocuments({ owner: owner._id }), 1);
  const otherProducts = await request("/products", { token: otherToken });
  assert.equal(otherProducts.status, 200);
  assert.equal(otherProducts.data.products.length, 0);

  const saleBody = {
    customerType: "walkin",
    saleType: "wholesale",
    items: [{ productId: product._id, quantity: 2 }],
    expectedTotal: 40,
    payments: [{ method: "cash", amount: 40 }],
  };
  const foreignSale = await request("/sales", {
    method: "POST", body: saleBody, key: crypto.randomUUID(), token: otherToken,
  });
  assert.equal(foreignSale.status, 404);
  assert.equal((await Product.findById(product._id)).stock, 5);
  assert.equal(await Sale.countDocuments(), 0);

  const saleKey = crypto.randomUUID();
  const sale = await request("/sales", { method: "POST", body: saleBody, key: saleKey });
  assert.equal(sale.status, 201, sale.data.message);
  assert.equal(sale.data.sale.items[0].costPrice, null);
  assert.equal(sale.data.sale.items[0].quantity, 2);
  assert.equal((await Product.findById(product._id)).stock, 3);
  assert.equal((await Product.findById(product._id)).soldCount, 2);

  const saleReplay = await request("/sales", { method: "POST", body: saleBody, key: saleKey });
  assert.equal(saleReplay.status, 200);
  assert.equal(saleReplay.data.sale._id, sale.data.sale._id);
  assert.equal((await Product.findById(product._id)).stock, 3);
  assert.equal(await Sale.countDocuments({ owner: owner._id }), 1);

  const costUpdate = await request(`/products/${product._id}`, {
    method: "PUT", body: { costPrice: 9 },
  });
  assert.equal(costUpdate.status, 200);
  const historicalSale = await Sale.findById(sale.data.sale._id).lean();
  assert.equal(historicalSale.items[0].costPrice ?? null, null);

  const beforeFailedSale = await Product.findById(product._id).lean();
  const invalidSale = await request("/sales", {
    method: "POST",
    body: { ...saleBody, items: [{ productId: product._id, quantity: 1 }], expectedTotal: 20,
      payments: [{ method: "cash", amount: 20 }], notes: {} },
    key: crypto.randomUUID(),
  });
  assert.ok(invalidSale.status >= 400);
  assert.deepEqual(await Product.findById(product._id).lean(), beforeFailedSale);
  assert.equal(await Sale.countDocuments({ owner: owner._id }), 1);
});
