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
