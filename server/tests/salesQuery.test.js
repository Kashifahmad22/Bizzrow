const test = require("node:test");
const assert = require("node:assert");
const { buildSalesFilter, resolveSaleSort } = require("../utils/salesQuery");

test("scopes to owner", () => {
  assert.equal(buildSalesFilter({ ownerId: "o1" }).owner, "o1");
});

test("applies valid status and customer", () => {
  const f = buildSalesFilter({ ownerId: "o1", status: "paid", customerId: "c1" });
  assert.equal(f.paymentStatus, "paid");
  assert.equal(f.customer, "c1");
});

test("ignores invalid status", () => {
  assert.equal(buildSalesFilter({ ownerId: "o1", status: "bogus" }).paymentStatus, undefined);
});

test("date range produces consistent createdAt bounds", () => {
  const f = buildSalesFilter({ ownerId: "o1", from: "2026-06-08", to: "2026-06-08" });
  assert.equal(f.createdAt.$gte.toISOString(), "2026-06-08T00:00:00.000Z");
  assert.equal(f.createdAt.$lte.toISOString(), "2026-06-08T23:59:59.999Z");
});

test("customer name search is case-insensitive regex", () => {
  const f = buildSalesFilter({ ownerId: "o1", q: "rah" });
  assert.ok(f.customerName instanceof RegExp);
  assert.ok(f.customerName.test("Rahul"));
});

test("sort resolves correctly", () => {
  assert.deepEqual(resolveSaleSort("oldest"), { createdAt: 1 });
  assert.deepEqual(resolveSaleSort("highest"), { total: -1 });
  assert.deepEqual(resolveSaleSort("lowest"), { total: 1 });
  assert.deepEqual(resolveSaleSort(), { createdAt: -1 });
});
