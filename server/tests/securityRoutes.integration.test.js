const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const whatsapp = require("../services/whatsappService");
const { errorHandler } = require("../middleware/error");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("customer inputs and broadcast selections are validated before owner-scoped operations", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  await connectIsolatedMongo(uri, [User, Customer, Product, Counter]);
  t.after(() => mongoose.disconnect());
  process.env.JWT_SECRET = crypto.randomUUID();
  const owner = await User.create({ name: "Synthetic", email: `${crypto.randomUUID()}@example.invalid`, password: crypto.randomUUID() });
  const other = await User.create({ name: "Other", email: `${crypto.randomUUID()}@example.invalid`, password: crypto.randomUUID() });
  const customer = await Customer.create({ owner: owner._id, name: "Owned", phone: "123" });
  const foreign = await Customer.create({ owner: other._id, name: "Foreign", phone: "456" });
  const product = await Product.create({ owner: owner._id, name: "Synthetic item", sellingPrice: 1, stock: 5 });
  const token = jwt.sign({ id: String(owner._id), tokenVersion: 0 }, process.env.JWT_SECRET);
  const originalBroadcast = whatsapp.sendBroadcast;
  const calls = [];
  whatsapp.sendBroadcast = async (input) => { calls.push(input); return { sent: input.customers.length }; };
  t.after(() => { whatsapp.sendBroadcast = originalBroadcast; });
  const app = express();
  app.use(express.json());
  for (const route of ["sales", "customers", "ledger", "whatsapp"]) app.use(`/${route}`, require(`../routes/${route}`));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function request(path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.status;
  }
  const sale = { customerType: "existing", customerId: { $ne: null }, items: [{ productId: String(product._id), quantity: 1 }] };
  assert.equal(await request("/sales", sale), 400);
  assert.equal(await request("/sales", { ...sale, customerType: "new", newCustomer: { name: "Injected", phone: { $ne: "" } } }), 400);
  assert.equal(await request("/sales", { ...sale, customerId: String(foreign._id) }), 404);
  assert.equal(await request("/customers", { name: "Injected", phone: ["123"] }), 400);
  assert.equal(await request("/ledger/invalid"), 400);
  for (const payload of [{ body: "Synthetic" }, { body: "Synthetic", customerIds: [] }, { body: "Synthetic", customerIds: {} }]) {
    assert.equal(await request("/whatsapp/broadcast", payload), 400);
  }
  assert.equal(calls.length, 0);
  assert.equal(await request("/whatsapp/broadcast", { body: "Synthetic", allCustomers: true }), 200);
  assert.deepEqual(calls[0].customers.map((entry) => String(entry._id)), [String(customer._id)]);
  assert.equal(await request("/whatsapp/broadcast", { body: "Synthetic", customerIds: [String(foreign._id)] }), 400);
  assert.equal(calls.length, 1);
});
