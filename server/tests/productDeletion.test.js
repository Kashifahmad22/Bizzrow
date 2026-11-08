const test = require("node:test");
const assert = require("node:assert");
const { deleteUnusedProduct, isValidProductId } = require("../services/productDeletion");

function createHarness({
  product = { _id: "product-1", owner: "owner-1", name: "Unused duplicate", stock: 0 },
  sale = null,
  returnRecord = null,
  batch = null,
  adjustment = null,
  deletedCount = 1,
} = {}) {
  const session = { id: "session" };
  const calls = [];
  const query = (name, value) => ({
    select(fields) {
      calls.push([`${name}.select`, fields]);
      return this;
    },
    session(receivedSession) {
      assert.equal(receivedSession, session);
      calls.push([`${name}.session`]);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  });
  const Product = {
    findOne(filter) {
      calls.push(["Product.findOne", filter]);
      return query("Product.findOne", product);
    },
    async deleteOne(filter, options) {
      calls.push(["Product.deleteOne", filter, options]);
      assert.equal(options.session, session);
      return { deletedCount };
    },
  };
  const Sale = {
    findOne(filter) {
      calls.push(["Sale.findOne", filter]);
      return query("Sale.findOne", sale);
    },
  };
  const ReturnRecord = {
    findOne(filter) {
      calls.push(["ReturnRecord.findOne", filter]);
      return query("ReturnRecord.findOne", returnRecord);
    },
  };
  const StockBatch = {
    findOne(filter) {
      calls.push(["StockBatch.findOne", filter]);
      return query("StockBatch.findOne", batch);
    },
  };
  const StockAdjustment = {
    findOne(filter) {
      calls.push(["StockAdjustment.findOne", filter]);
      return query("StockAdjustment.findOne", adjustment);
    },
  };
  return {
    args: { Product, Sale, ReturnRecord, StockBatch, StockAdjustment, ownerId: "owner-1", productId: "product-1", session },
    calls,
  };
}

test("unused zero-stock product can be deleted without touching other records", async () => {
  const harness = createHarness();
  const result = await deleteUnusedProduct(harness.args);

  assert.deepEqual(result, { id: "product-1", name: "Unused duplicate" });
  const deleteCall = harness.calls.find(([name]) => name === "Product.deleteOne");
  assert.deepEqual(deleteCall[1], { _id: "product-1", owner: "owner-1", stock: 0 });
  assert.equal(harness.calls.some(([name]) => name === "Sale.findOne"), true);
  assert.equal(harness.calls.some(([name]) => name === "ReturnRecord.findOne"), true);
  assert.equal(harness.calls.some(([name]) => name === "StockBatch.findOne"), true);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "Sale.findOne")[1],
    { owner: "owner-1", "items.product": "product-1" }
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "ReturnRecord.findOne")[1],
    { owner: "owner-1", "items.product": "product-1" }
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "StockBatch.findOne")[1],
    { owner: "owner-1", product: "product-1" }
  );
});

test("deletion requires authenticated tenant ownership", async () => {
  const harness = createHarness({ product: null });
  await assert.rejects(
    deleteUnusedProduct(harness.args),
    (error) => error.status === 404
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "Product.findOne")[1],
    { _id: "product-1", owner: "owner-1" }
  );
  assert.equal(harness.calls.some(([name]) => name === "Product.deleteOne"), false);
});

test("deletion route can reject malformed product identifiers before database access", () => {
  assert.equal(isValidProductId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidProductId("not-a-product-id"), false);
  assert.equal(isValidProductId(""), false);
});

test("deletion is blocked when product stock remains", async () => {
  const harness = createHarness({ product: { _id: "product-1", name: "Has stock", stock: 2 } });
  await assert.rejects(
    deleteUnusedProduct(harness.args),
    (error) => error.status === 409 && /stock remains/.test(error.message)
  );
  assert.equal(harness.calls.some(([name]) => name === "Product.deleteOne"), false);
});

test("deletion is blocked by historical sales and replacements", async () => {
  const harness = createHarness({ sale: { _id: "sale-1" } });
  await assert.rejects(
    deleteUnusedProduct(harness.args),
    (error) => error.status === 409 && /sale or replacement/.test(error.message)
  );
  assert.equal(harness.calls.some(([name]) => name === "ReturnRecord.findOne"), false);
  assert.equal(harness.calls.some(([name]) => name === "Product.deleteOne"), false);
});

test("deletion is blocked by return or replacement records", async () => {
  const harness = createHarness({ returnRecord: { _id: "return-1" } });
  await assert.rejects(
    deleteUnusedProduct(harness.args),
    (error) => error.status === 409 && /return or replacement/.test(error.message)
  );
  assert.equal(harness.calls.some(([name]) => name === "Product.deleteOne"), false);
});

test("deletion is blocked by batch history even when no batch stock remains", async () => {
  const harness = createHarness({ batch: { _id: "batch-1", remainingQuantity: 0 } });
  await assert.rejects(
    deleteUnusedProduct(harness.args),
    (error) => error.status === 409 && /purchase batch history/.test(error.message)
  );
  assert.equal(harness.calls.some(([name]) => name === "Product.deleteOne"), false);
});

test("deletion is blocked by stock adjustment history", async () => {
  const harness = createHarness({ adjustment: { _id: "adjustment-1" } });
  await assert.rejects(deleteUnusedProduct(harness.args), (error) =>
    error.status === 409 && /stock adjustment history/.test(error.message));
  assert.equal(harness.calls.some(([name]) => name === "Product.deleteOne"), false);
});

test("deletion detects a product changed after the safety checks", async () => {
  const harness = createHarness({ deletedCount: 0 });
  await assert.rejects(
    deleteUnusedProduct(harness.args),
    (error) => error.status === 409 && /changed while deletion/.test(error.message)
  );
});
