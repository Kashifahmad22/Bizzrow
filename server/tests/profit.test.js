const test = require("node:test");
const assert = require("node:assert");
const { saleProfit, aggregateProfit } = require("../utils/profit");

test("profit uses item cost snapshot", () => {
  const sale = { total: 1000, items: [{ quantity: 2, costPrice: 300, product: "p1" }] };
  const r = saleProfit(sale);
  assert.equal(r.cogs, 600);
  assert.equal(r.profit, 400);
});

test("profit falls back to costMap for legacy items", () => {
  const sale = { total: 500, items: [{ quantity: 1, product: "p2" }] };
  const r = saleProfit(sale, { p2: 200 });
  assert.equal(r.cogs, 200);
  assert.equal(r.profit, 300);
});

test("returns reduce both revenue and COGS", () => {
  const sale = { total: 1000, returnedAmount: 500, items: [{ quantity: 2, returnedQty: 1, costPrice: 300, product: "p1" }] };
  const r = saleProfit(sale);
  assert.equal(r.netRevenue, 500); // 1000 - 500
  assert.equal(r.cogs, 300); // 1 net unit * 300
  assert.equal(r.profit, 200);
});

test("profit uses the discounted sale total after a proportional item return", () => {
  const sale = {
    total: 90,
    returnedAmount: 54,
    items: [
      { quantity: 1, returnedQty: 1, costPrice: 25, product: "p1", subtotal: 60 },
      { quantity: 1, returnedQty: 0, costPrice: 10, product: "p2", subtotal: 40 },
    ],
  };
  const r = saleProfit(sale);
  assert.equal(r.netRevenue, 36);
  assert.equal(r.cogs, 10);
  assert.equal(r.profit, 26);
});

test("aggregate sums across sales", () => {
  const sales = [
    { total: 1000, items: [{ quantity: 1, costPrice: 600, product: "a" }] },
    { total: 500, items: [{ quantity: 1, costPrice: 200, product: "b" }] },
  ];
  const r = aggregateProfit(sales);
  assert.equal(r.revenue, 1500);
  assert.equal(r.cogs, 800);
  assert.equal(r.profit, 700);
  assert.equal(r.orders, 2);
});

test("batch cost snapshots determine COGS and returned quantities restore FIFO cost", () => {
  const sale = {
    total: 1000,
    items: [{
      quantity: 5,
      returnedQty: 3,
      costPrice: 200,
      product: "p1",
      batchAllocations: [
        { batch: "b1", quantity: 2, costPrice: 250 },
        { batch: "b2", quantity: 2, costPrice: 270 },
      ],
    }],
  };
  const result = saleProfit(sale);
  assert.equal(result.cogs, 470);
  assert.equal(result.profit, 530);
});

test("legacy-first returns retain the correct remaining batch costs", () => {
  const sale = { total: 100, items: [{
    quantity: 4, returnedQty: 2, costPrice: 10, legacyQuantityFirst: 1,
    batchAllocations: [{ batch: "b1", quantity: 3, costPrice: 20 }],
  }] };
  assert.equal(saleProfit(sale).cogs, 40);
});
