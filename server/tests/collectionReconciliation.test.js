const test = require("node:test");
const assert = require("node:assert/strict");
const {
  methodAggToObject,
  refundCollectionPipeline,
} = require("../utils/collectionReconciliation");

test("dashboard collection totals include tender only, never replacement credit", () => {
  const result = methodAggToObject([
    { _id: "cash", amount: 10 },
    { _id: "upi", amount: 5 },
    { _id: "credit", amount: 40 },
    { _id: "unknown", amount: 3 },
  ]);
  assert.deepEqual(result, {
    breakdown: { cash: 10, upi: 5, bank: 0, card: 0, credit: 0 },
    total: 15,
  });
});

test("refund aggregation includes tender-source refunds and excludes non-tender methods", () => {
  const pipeline = refundCollectionPipeline("owner", { $gte: new Date(0) });
  const amountProjection = pipeline.find((stage) => stage.$project?.amount).$project.amount;
  assert.deepEqual(amountProjection.$cond[1].$cond[0].$in[1], ["cash", "upi", "bank", "card"]);
  assert.equal(pipeline[pipeline.length - 1].$group._id, "$method");
});

test("refund trend uses the same refund values grouped by refund date", () => {
  const pipeline = refundCollectionPipeline("owner", { $gte: new Date(0) }, { trend: true });
  const amountProjection = pipeline.find((stage) => stage.$project?.amount).$project.amount;
  assert.equal(amountProjection.$cond[2], "$legacyRefund");
  assert.equal(pipeline[pipeline.length - 1].$group._id.$dateToString.date, "$createdAt");
  assert.equal(pipeline[pipeline.length - 1].$group.amount.$sum, "$amount");
});
