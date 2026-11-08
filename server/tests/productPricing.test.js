const test = require("node:test");
const assert = require("node:assert");
const Product = require("../models/Product");
const {
  wholesalePrice,
  retailPrice,
  salePrice,
  normalizeProductPrices,
  serializeProduct,
} = require("../utils/productPricing");

test("legacy selling price remains the wholesale price with a 2x retail fallback", () => {
  const product = { sellingPrice: 125 };
  assert.equal(wholesalePrice(product), 125);
  assert.equal(retailPrice(product), 250);
  assert.equal(salePrice(product, "wholesale"), 125);
  assert.equal(salePrice(product, "retail"), 250);
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

test("unknown cost does not report a fabricated margin", () => {
  const product = new Product({ name: "Test", sellingPrice: 100, costPrice: null });
  assert.equal(product.margin, null);
  assert.equal(product.marginPercent, null);
  product.costPrice = 40;
  assert.equal(product.margin, 60);
  assert.equal(product.marginPercent, 60);
});
