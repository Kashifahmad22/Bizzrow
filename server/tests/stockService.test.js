const test = require("node:test");
const assert = require("node:assert");
const { decrementStock, getStockRequirements } = require("../services/stockService");

test("duplicate product lines are consolidated before decrement", async () => {
  const updates = [];
  const Product = {
    async updateOne(filter, update) {
      updates.push({ filter, update });
      return { modifiedCount: 1 };
    },
  };
  const ownerId = "owner";
  await decrementStock({
    Product,
    ownerId,
    items: [
      { product: "product-a", quantity: 2 },
      { product: "product-a", quantity: 3 },
    ],
  });
  assert.deepEqual([...getStockRequirements([
    { product: "product-a", quantity: 2 },
    { product: "product-a", quantity: 3 },
  ])], [["product-a", 5]]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter.stock.$gte, 5);
  assert.equal(updates[0].update.$inc.stock, -5);
});

test("conditional updates prevent concurrent sales from overselling stock", async () => {
  let stock = 5;
  const Product = {
    async updateOne(filter) {
      const required = filter.stock.$gte;
      if (stock < required) return { matchedCount: 0, modifiedCount: 0 };
      stock -= required;
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const sale = () => decrementStock({
    Product,
    ownerId: "owner",
    items: [{ product: "product-a", quantity: 4 }],
  });

  const results = await Promise.allSettled([sale(), sale()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(stock, 1);
});

test("stock failures are explicit for transaction rollback", async () => {
  const Product = {
    async updateOne() {
      return { matchedCount: 0, modifiedCount: 0 };
    },
  };
  await assert.rejects(
    decrementStock({
      Product,
      ownerId: "owner",
      items: [{ product: "product-a", quantity: 1 }],
    }),
    (error) => error.status === 409 && /Insufficient stock/.test(error.message)
  );
});

test("FIFO batch deduction records batch costs and reconciles total stock", async () => {
  const product = { _id: "product-a", stock: 65 };
  const batches = [
    { _id: "batch-1", remainingQuantity: 35, costPrice: 250 },
    { _id: "batch-2", remainingQuantity: 30, costPrice: 270 },
  ];
  const query = (value) => ({
    session() { return this; },
    sort() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const Product = {
    findOne: () => query(product),
    async updateOne(filter, update) {
      if (product.stock < filter.stock.$gte) return { modifiedCount: 0 };
      product.stock += update.$inc.stock;
      return { modifiedCount: 1 };
    },
  };
  const StockBatch = {
    find: () => query(batches.filter((batch) => batch.remainingQuantity > 0)),
    async updateOne(filter, update) {
      const batch = batches.find((item) => item._id === filter._id);
      if (!batch || batch.remainingQuantity < filter.remainingQuantity.$gte) return { modifiedCount: 0 };
      batch.remainingQuantity += update.$inc.remainingQuantity;
      return { modifiedCount: 1 };
    },
  };
  const items = [{ product: "product-a", quantity: 40, costPrice: 200 }];
  await decrementStock({ Product, StockBatch, ownerId: "owner-a", items });
  assert.equal(product.stock, 25);
  assert.deepEqual(batches.map((batch) => batch.remainingQuantity), [0, 25]);
  assert.deepEqual(items[0].batchAllocations, [
    { batch: "batch-1", quantity: 35, costPrice: 250 },
    { batch: "batch-2", quantity: 5, costPrice: 270 },
  ]);
  assert.equal(product.stock, batches.reduce((sum, batch) => sum + batch.remainingQuantity, 0));
});

test("batch stock inconsistency blocks sale instead of silently consuming stale batches", async () => {
  const query = (value) => ({
    session() { return this; },
    sort() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const Product = {
    findOne: () => query({ _id: "product-a", stock: 5 }),
    async updateOne() { assert.fail("product stock must not be changed"); },
  };
  const StockBatch = {
    find: () => query([{ _id: "batch-a", remainingQuantity: 6, costPrice: 10 }]),
  };
  await assert.rejects(
    decrementStock({
      Product,
      StockBatch,
      ownerId: "owner-a",
      items: [{ product: "product-a", quantity: 1 }],
    }),
    (error) => error.status === 409 && /does not reconcile/.test(error.message)
  );
});

test("products without batch history continue to sell from legacy stock", async () => {
  const product = { _id: "product-a", stock: 12 };
  const query = (value) => ({
    session() { return this; },
    sort() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const Product = {
    findOne: () => query(product),
    async updateOne(_filter, update) {
      product.stock += update.$inc.stock;
      return { modifiedCount: 1 };
    },
  };
  const StockBatch = { find: () => query([]) };
  const items = [{ product: "product-a", quantity: 4 }];
  await decrementStock({ Product, StockBatch, ownerId: "owner", items });
  assert.equal(product.stock, 8);
  assert.deepEqual(items[0].batchAllocations, []);
});
