const test = require("node:test");
const assert = require("node:assert/strict");
const { adjustStock } = require("../services/stockAdjustment");

function harness({ stock = 12, remaining = 8, prior = [] } = {}) {
  const session = {};
  const product = { _id: "p", stock };
  const batch = { _id: "b", remainingQuantity: remaining, quantityReceived: 10 };
  const calls = [];
  const query = (value) => ({
    select() { return this; },
    session(received) { assert.equal(received, session); return Promise.resolve(value); },
  });
  const Product = {
    findOne: (filter) => { assert.equal(filter.owner, "owner"); return query(product); },
    updateOne: async (filter, update, options) => {
      assert.equal(options.session, session);
      calls.push(["product", filter, update]);
      return { modifiedCount: 1 };
    },
  };
  const StockBatch = {
    find: (filter) => { assert.equal(filter.owner, "owner"); return query([batch]); },
    updateOne: async (filter, update, options) => {
      assert.equal(options.session, session);
      calls.push(["batch", filter, update]);
      return { modifiedCount: 1 };
    },
  };
  const StockAdjustment = {
    find: (filter) => { assert.equal(filter.owner, "owner"); return query(prior); },
    create: async (docs, options) => {
      assert.equal(options.session, session);
      calls.push(["audit", docs[0]]);
      return [{ ...docs[0], _id: "adjustment" }];
    },
  };
  return { args: { Product, StockBatch, StockAdjustment, ownerId: "owner", productId: "p", session }, calls };
}

test("legacy correction records reason and before/after stock", async () => {
  const { args, calls } = harness();
  const result = await adjustStock({ ...args, delta: -3, reason: "Opening count" });
  assert.equal(result.product.stock, 9);
  assert.deepEqual(calls.map((entry) => entry[0]), ["product", "audit"]);
  assert.equal(calls[1][1].sourceBefore, 4);
  assert.equal(calls[1][1].sourceAfter, 1);
  assert.equal(calls[1][1].reason, "Opening count");
});

test("batch corrections update the selected batch and audit atomically", async () => {
  const { args, calls } = harness();
  const result = await adjustStock({ ...args, batchId: "b", delta: -3, reason: "Damaged" });
  assert.equal(result.adjustment.sourceAfter, 5);
  assert.deepEqual(calls.map((entry) => entry[0]), ["batch", "product", "audit"]);
});

test("batch increase only reverses recorded reductions and respects received quantity", async () => {
  const allowed = harness({ prior: [{ delta: -3 }, { delta: 1 }], remaining: 5 });
  await adjustStock({ ...allowed.args, batchId: "b", delta: 2, reason: "Recount" });
  const blocked = harness({ prior: [{ delta: -3 }, { delta: 1 }], remaining: 5 });
  await assert.rejects(adjustStock({ ...blocked.args, batchId: "b", delta: 3, reason: "Recount" }), /only reverse/);
  assert.equal(blocked.calls.length, 0);
});

test("invalid reason, negative source, unknown batch, and inconsistent stock are rejected", async () => {
  await assert.rejects(adjustStock({ ...harness().args, delta: -1, reason: " " }), /reason/);
  await assert.rejects(adjustStock({ ...harness().args, delta: -5, reason: "count" }), /negative/);
  await assert.rejects(adjustStock({ ...harness().args, batchId: "other", delta: -1, reason: "count" }), /Batch not found/);
  await assert.rejects(adjustStock({ ...harness({ stock: 5 }).args, delta: 1, reason: "count" }), /does not reconcile/);
});
