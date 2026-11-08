const test = require("node:test");
const assert = require("node:assert");
const Product = require("../models/Product");
const {
  wholesalePrice,
  retailPrice,
  salePrice,
  initialSalePrice,
  normalizeProductPrices,
  serializeProduct,
  validateCurrency,
} = require("../utils/productPricing");

test("legacy selling price remains the wholesale price with a 2x retail fallback", () => {
  const product = { sellingPrice: 125 };
  assert.equal(wholesalePrice(product), 125);
  assert.equal(retailPrice(product), 250);
  assert.equal(salePrice(product, "wholesale"), 125);
  assert.equal(salePrice(product, "retail"), 250);
});

test("new checkout safeguards and cash tender always use server prices while legacy pricing remains compatible", () => {
  const product = { sellingPrice: 100, wholesalePrice: 90, retailPrice: 145 };
  const item = { unitPrice: 1 };
  for (const body of [
    { saleType: "wholesale" },
    { expectedTotal: 1 },
    { reviewedItems: [] },
    { cashTendered: 1 },
  ]) assert.equal(initialSalePrice(product, "wholesale", item, body), 90);
  assert.equal(initialSalePrice(product, "retail", item, { cashTendered: 1 }), 145);
  assert.equal(initialSalePrice(product, "wholesale", item, {}), 1);
  assert.equal(initialSalePrice(product, "wholesale", {}, {}), 90);
});

test("explicit wholesale and retail prices are selected and serialized", () => {
  const product = { sellingPrice: 100, wholesalePrice: 90, retailPrice: 145 };
  assert.equal(salePrice(product, "wholesale"), 90);
  assert.equal(salePrice(product, "retail"), 145);
  assert.deepEqual(serializeProduct(product), {
    sellingPrice: 90,
    wholesalePrice: 90,
    retailPrice: 145,
  });
});

test("product price normalization preserves legacy input and defaults retail on creation", () => {
  assert.deepEqual(normalizeProductPrices({ sellingPrice: "12.5" }, { creating: true }), {
    wholesalePrice: 12.5,
    sellingPrice: 12.5,
    retailPrice: 25,
  });
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 100, retailPrice: 135 }), {
    wholesalePrice: 100,
    sellingPrice: 100,
    retailPrice: 135,
  });
});

test("invalid pricing modes and negative prices are rejected", () => {
  assert.throws(() => salePrice({ sellingPrice: 10 }, "bulk"), /Sale type must be wholesale or retail/);
  assert.throws(() => normalizeProductPrices({ wholesalePrice: -1 }), /non-negative number/);
});

test("new product and batch currency inputs use the payment precision policy", () => {
  assert.equal(validateCurrency("12.34", "costPrice"), 12.34);
  assert.equal(validateCurrency(0, "costPrice"), 0);
  for (const value of ["1.005", -1, {}, [], "1e2"]) {
    assert.throws(() => validateCurrency(value, "costPrice"), { status: 400 });
    assert.throws(() => normalizeProductPrices({ sellingPrice: value }, { creating: true }), { status: 400 });
  }
  assert.throws(() => normalizeProductPrices({ sellingPrice: 1, retailPrice: 1.005 }), { status: 400 });
});

test("unchanged historical prices survive product edits without allowing new extra precision", () => {
  const current = { sellingPrice: 1.234, wholesalePrice: 1.234, retailPrice: 2.468 };
  assert.deepEqual(normalizeProductPrices({ sellingPrice: "1.234", retailPrice: 2.468 }, { current }),
    { sellingPrice: 1.234, wholesalePrice: 1.234, retailPrice: 2.468 });
  assert.throws(() => normalizeProductPrices({ sellingPrice: 1.235 }, { current }), { status: 400 });
});

test("unknown cost does not report a fabricated margin", () => {
  const product = new Product({ name: "Test", sellingPrice: 100, costPrice: null });
  assert.equal(product.margin, null);
  assert.equal(product.marginPercent, null);
  product.costPrice = 40;
  assert.equal(product.margin, 60);
  assert.equal(product.marginPercent, 60);
});
