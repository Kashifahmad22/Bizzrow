const test = require("node:test");
const assert = require("node:assert");
const {
  idempotencyIdentity,
  isUnsupportedTransactionError,
  requestFingerprint,
  requireIdempotencyKey,
} = require("../services/financialTransaction");

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
