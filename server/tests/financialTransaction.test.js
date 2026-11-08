const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const Counter = require("../models/Counter");
const { validateExpectedTotal, validateReviewedItems } = require("../utils/saleMath");
const {
  executeIdempotently,
  idempotencyIdentity,
  isUnsupportedTransactionError,
  requestFingerprint,
  requireIdempotencyKey,
} = require("../services/financialTransaction");

test("failed preparation performs no writes and allows corrected retry with the same key", async () => {
  const originalStart = mongoose.startSession;
  const originalFind = Counter.findById;
  const originalCreate = Counter.create;
  const records = new Map();
  let writes = 0;
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  });
  Counter.findById = (id) => ({ session: async () => records.get(id) });
  Counter.create = async ([data]) => {
    writes += 1;
    const record = { ...data, save: async () => records.set(data._id, record) };
    return [record];
  };
  try {
    const run = (expectedTotal) => executeIdempotently({
      ownerId: "owner", operation: "sale-create", key: "request-key",
      fingerprint: requestFingerprint("sale:create", {}, { expectedTotal }),
      prepare: async () => {
        validateExpectedTotal({ expectedTotal }, 290);
        return { total: 290 };
      },
      work: async (_session, prepared) => {
        writes += 1;
        return { resultType: "sale", resultId: "sale-id", value: prepared.total };
      },
      replay: async (record) => record.resultId,
    });
    await assert.rejects(run(282), (error) => error.status === 409);
    assert.equal(writes, 0);
    assert.equal(records.size, 0);
    assert.equal(await run(290), 290);
    assert.equal(writes, 2);
    assert.equal(await run(290), "sale-id");
    assert.equal(writes, 2);
    await assert.rejects(run(291), (error) => error.status === 409);
  } finally {
    mongoose.startSession = originalStart;
    Counter.findById = originalFind;
    Counter.create = originalCreate;
  }
});

test("rejected reviewed prices leave the key unused for a corrected retry", async () => {
  const originalStart = mongoose.startSession;
  const originalFind = Counter.findById;
  const originalCreate = Counter.create;
  const records = new Map();
  let writes = 0;
  mongoose.startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} });
  Counter.findById = (id) => ({ session: async () => records.get(id) });
  Counter.create = async ([data]) => {
    writes += 1;
    const record = { ...data, save: async () => records.set(data._id, record) };
    return [record];
  };
  try {
    const id = "0123456789abcdef01234567";
    const run = (unitPrice) => {
      const body = { reviewedItems: [{ productId: id, quantity: 1, unitPrice }] };
      return executeIdempotently({
        ownerId: "owner", operation: "sale-create", key: "request-key",
        fingerprint: requestFingerprint("sale:create", {}, body),
        prepare: async () => validateReviewedItems(body, [{ product: id, quantity: 1, unitPrice: 110 }]),
        work: async () => {
          writes += 1;
          return { resultType: "sale", resultId: "sale-id", value: "created" };
        },
        replay: async (record) => record.resultId,
      });
    };
    await assert.rejects(run(100), (error) => error.status === 409);
    assert.equal(writes, 0);
    assert.equal(records.size, 0);
    assert.equal(await run(110), "created");
    assert.equal(await run(110), "sale-id");
    assert.equal(writes, 2);
  } finally {
    mongoose.startSession = originalStart;
    Counter.findById = originalFind;
    Counter.create = originalCreate;
  }
});

test("idempotency fingerprints ignore object key ordering but detect changed values", () => {
  assert.equal(
    requestFingerprint("sale:create", {}, { items: [{ productId: "p1", quantity: 1 }], notes: "" }),
    requestFingerprint("sale:create", {}, { notes: "", items: [{ quantity: 1, productId: "p1" }] })
  );
  assert.notEqual(
    requestFingerprint("sale:create", {}, { items: [{ productId: "p1", quantity: 1 }] }),
    requestFingerprint("sale:create", {}, { items: [{ productId: "p1", quantity: 2 }] })
  );
});

test("idempotency identities scope keys by owner and operation without exposing raw keys", () => {
  const first = idempotencyIdentity("owner-a", "sale-create", "request-key-123");
  assert.notEqual(first, idempotencyIdentity("owner-b", "sale-create", "request-key-123"));
  assert.notEqual(first, idempotencyIdentity("owner-a", "sale-return", "request-key-123"));
  assert.equal(first.includes("request-key-123"), false);
});

test("financial writes require a bounded idempotency key", () => {
  assert.equal(requireIdempotencyKey({ get: () => "request-key-123" }), "request-key-123");
  assert.throws(
    () => requireIdempotencyKey({ get: () => "short" }),
    (error) => error.status === 400
  );
});

test("MongoDB transaction capability errors are recognized explicitly", () => {
  assert.equal(isUnsupportedTransactionError({
    code: 20,
    message: "Transaction numbers are only allowed on a replica set member or mongos",
  }), true);
  assert.equal(isUnsupportedTransactionError(new Error("network timeout")), false);
});
