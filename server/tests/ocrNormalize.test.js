const test = require("node:test");
const assert = require("node:assert");
const { normalizeUnit, normalizeLine, normalizeExtraction } = require("../utils/ocrNormalize");

test("unit aliases normalize", () => {
  assert.equal(normalizeUnit("Nos"), "pcs");
  assert.equal(normalizeUnit("PCS"), "pcs");
  assert.equal(normalizeUnit("Pieces"), "pcs");
  assert.equal(normalizeUnit("BOX"), "box");
  assert.equal(normalizeUnit("Kgs"), "kg");
});

test("rate / unit price / purchase rate map to costPrice", () => {
  assert.equal(normalizeLine({ name: "A", Qty: "5", Rate: "₹1,200" }).costPrice, 1200);
  assert.equal(normalizeLine({ name: "B", "Unit Price": "50" }).costPrice, 50);
  assert.equal(normalizeLine({ name: "C", purchaseRate: "99.5" }).costPrice, 99.5);
});

test("qty aliases map to quantity", () => {
  assert.equal(normalizeLine({ name: "A", QTY: "10" }).quantity, 10);
  assert.equal(normalizeLine({ name: "B", nos: "3" }).quantity, 3);
});

test("split CGST + SGST sums into gstPct", () => {
  const l = normalizeLine({ name: "A", cgst: "9", sgst: "9", costPrice: "100" });
  assert.equal(l.gstPct, 18);
});

test("extraction drops nameless rows", () => {
  const e = normalizeExtraction({ items: [{ name: "X", rate: "10" }, { rate: "5" }] });
  assert.equal(e.items.length, 1);
  assert.equal(e.items[0].costPrice, 10);
});
