const test = require("node:test");
const assert = require("node:assert");
const Product = require("../models/Product");
const {
  wholesalePrice,
  retailPrice,
  defaultRetailPrice,
  isRetailOverridden,
  gstBreakdown,
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
    retailPriceOverridden: true,
  });
});

test("product price normalization preserves legacy input and defaults retail on creation", () => {
  assert.deepEqual(normalizeProductPrices({ sellingPrice: "12.5" }, { creating: true }), {
    wholesalePrice: 12.5,
    sellingPrice: 12.5,
    retailPrice: 25,
    retailPriceOverridden: false,
  });
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 100, retailPrice: 135 }, { creating: true }), {
    wholesalePrice: 100,
    sellingPrice: 100,
    retailPrice: 135,
    retailPriceOverridden: true,
  });
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 100, retailPrice: 200 }, { creating: true }), {
    wholesalePrice: 100,
    sellingPrice: 100,
    retailPrice: 200,
    retailPriceOverridden: false,
  });
});

test("wholesale updates recalculate the default retail price unless it was manually overridden", () => {
  const auto = { sellingPrice: 100, wholesalePrice: 100, retailPrice: 200, retailPriceOverridden: false };
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 150 }, { current: auto }), {
    wholesalePrice: 150,
    sellingPrice: 150,
    retailPrice: 300,
    retailPriceOverridden: false,
  });
  const manual = { sellingPrice: 100, wholesalePrice: 100, retailPrice: 180, retailPriceOverridden: true };
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 150 }, { current: manual }), {
    wholesalePrice: 150,
    sellingPrice: 150,
  });
  // Legacy document without the override flag: a non-default retail price is
  // treated as manual and must never be silently overwritten.
  const legacyManual = { sellingPrice: 100, wholesalePrice: 100, retailPrice: 180 };
  assert.equal(isRetailOverridden(legacyManual), true);
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 150 }, { current: legacyManual }), {
    wholesalePrice: 150,
    sellingPrice: 150,
  });
  const legacyAuto = { sellingPrice: 100, wholesalePrice: 100, retailPrice: 200 };
  assert.equal(isRetailOverridden(legacyAuto), false);
  assert.deepEqual(normalizeProductPrices({ wholesalePrice: 150 }, { current: legacyAuto }), {
    wholesalePrice: 150,
    sellingPrice: 150,
    retailPrice: 300,
    retailPriceOverridden: false,
  });
});

test("an explicit retail price equal to the 2x default restores automatic retail pricing", () => {
  const manual = { sellingPrice: 100, wholesalePrice: 100, retailPrice: 180, retailPriceOverridden: true };
  assert.deepEqual(normalizeProductPrices({ retailPrice: 200 }, { current: manual }), {
    retailPrice: 200,
    retailPriceOverridden: false,
  });
  assert.deepEqual(normalizeProductPrices({ retailPrice: 210 }, { current: manual }), {
    retailPrice: 210,
    retailPriceOverridden: true,
  });
});

test("GST is extracted from inclusive prices and never added on top", () => {
  assert.deepEqual(gstBreakdown(500, 18), { gstPct: 18, gstAmount: 76.27, taxableValue: 423.73 });
  assert.deepEqual(gstBreakdown(112, 12), { gstPct: 12, gstAmount: 12, taxableValue: 100 });
  assert.deepEqual(gstBreakdown(500, 0), { gstPct: 0, gstAmount: 0, taxableValue: 500 });
  assert.deepEqual(gstBreakdown(0, 18), { gstPct: 0, gstAmount: 0, taxableValue: 0 });
  assert.deepEqual(gstBreakdown("bad", 18), { gstPct: 0, gstAmount: 0, taxableValue: 0 });
  // taxable + GST always reconstructs the entered inclusive amount.
  const { gstAmount, taxableValue } = gstBreakdown(999.99, 28);
  assert.equal(Math.round((gstAmount + taxableValue) * 100) / 100, 999.99);
});

test("default retail doubling is paise-exact", () => {
  for (const [wholesale, retail] of [[100, 200], [250, 500], [500, 1000], [750, 1500], [1000, 2000], [99.99, 199.98], [0.01, 0.02]]) {
    assert.equal(defaultRetailPrice(wholesale), retail);
  }
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
  assert.throws(() => normalizeProductPrices({ sellingPrice: 1, retailPrice: 1.005 }, { creating: true }), { status: 400 });
});

test("unchanged historical prices survive product edits without allowing new extra precision", () => {
  const current = { sellingPrice: 1.234, wholesalePrice: 1.234, retailPrice: 2.468 };
  assert.deepEqual(normalizeProductPrices({ sellingPrice: "1.234", retailPrice: 2.468 }, { current }),
    { sellingPrice: 1.234, wholesalePrice: 1.234, retailPrice: 2.468, retailPriceOverridden: true });
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
