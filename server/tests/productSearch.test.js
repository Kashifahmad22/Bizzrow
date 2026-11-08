const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const test = require("node:test");
const Product = require("../models/Product");
const User = require("../models/User");
const { errorHandler } = require("../middleware/error");
const { buildTextFilter } = require("../utils/search");

function matchesFilter(product, filter) {
  if (String(product.owner) !== String(filter.owner)) return false;
  if (!filter.$or) return true;
  return filter.$or.some((clause) =>
    Object.entries(clause).some(([field, expression]) =>
      expression.test(String(product[field] || ""))
    )
  );
}

class ProductQuery {
  constructor(products) {
    this.products = products;
    this.sortSpec = {};
    this.offset = 0;
    this.pageSize = products.length;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  skip(offset) {
    this.offset = offset;
    return this;
  }

  limit(pageSize) {
    this.pageSize = pageSize;
    return this;
  }

  then(resolve, reject) {
    const [field, direction] = Object.entries(this.sortSpec)[0] || ["createdAt", -1];
    const products = [...this.products].sort((a, b) => {
      const left = a[field];
      const right = b[field];
      if (left < right) return -1 * direction;
      if (left > right) return direction;
      return 0;
    });
    return Promise.resolve(products.slice(this.offset, this.offset + this.pageSize)).then(resolve, reject);
  }
}

function product({ id, owner, name, sku = "", barcode = "", createdAt = new Date(), stock = 1 }) {
  return {
    _id: id,
    owner,
    name,
    sku,
    barcode,
    category: "Apparel",
    brand: "",
    color: "",
    size: "",
    unit: "pcs",
    stock,
    sellingPrice: 10,
    wholesalePrice: 10,
    retailPrice: 20,
    createdAt,
  };
}

test("product search API preserves literal matching, tenant scope, and pagination", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const otherOwnerId = new mongoose.Types.ObjectId();
  const fixtures = [
    product({ id: "spaced-name", owner: ownerId, name: "Product ABC 123" }),
    product({ id: "joined-name", owner: ownerId, name: "Product ABC123" }),
    product({ id: "sku", owner: ownerId, name: "SKU Product", sku: "SKU-ABC 123" }),
    product({ id: "barcode", owner: ownerId, name: "Barcode Product", barcode: "ABC 123" }),
    product({ id: "double-space", owner: ownerId, name: "Product ABC  123" }),
    product({ id: "unicode-space", owner: ownerId, name: "Product ABC\u00a0123" }),
    product({ id: "other-tenant", owner: otherOwnerId, name: "Other ABC 123" }),
    ...Array.from({ length: 75 }, (_, index) =>
      product({
        id: `page-${index}`,
        owner: ownerId,
        name: `Needle Product ${index}`,
        createdAt: new Date(2026, 0, index + 1),
      })
    ),
  ];

  const oldFind = Product.find;
  const oldCountDocuments = Product.countDocuments;
  const oldFindById = User.findById;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();

  Product.find = (filter) => new ProductQuery(fixtures.filter((entry) => matchesFilter(entry, filter)));
  Product.countDocuments = async (filter) =>
    fixtures.filter((entry) => matchesFilter(entry, filter)).length;
  User.findById = () => ({
    select: async () => ({ _id: ownerId, tokenVersion: 0 }),
  });

  const app = express();
  app.use("/products", require("../routes/products"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const token = jwt.sign({ id: String(ownerId), tokenVersion: 0 }, process.env.JWT_SECRET);

  async function search(params) {
    const query = new URLSearchParams(params);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/products?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    assert.equal(response.status, 200, body.message);
    return body;
  }

  try {
    const spaced = await search({ q: "ABC 123" });
    assert.deepEqual(spaced.products.map((entry) => entry._id).sort(), [
      "barcode",
      "sku",
      "spaced-name",
    ]);

    const trimmed = await search({ q: "\u00a0aBc 123\t" });
    assert.deepEqual(trimmed.products.map((entry) => entry._id).sort(), [
      "barcode",
      "sku",
      "spaced-name",
    ]);

    const joined = await search({ q: "ABC123" });
    assert.deepEqual(joined.products.map((entry) => entry._id), ["joined-name"]);

    const repeatedSpace = await search({ q: "ABC  123" });
    assert.deepEqual(repeatedSpace.products.map((entry) => entry._id), ["double-space"]);

    const unicodeSpace = await search({ q: "ABC\u00a0123" });
    assert.deepEqual(unicodeSpace.products.map((entry) => entry._id), ["unicode-space"]);

    const secondPage = await search({ q: "Needle", limit: "50", page: "2" });
    assert.equal(secondPage.total, 75);
    assert.equal(secondPage.pages, 2);
    assert.equal(secondPage.products.length, 25);
    assert.equal(secondPage.products.some((entry) => String(entry.owner) === String(otherOwnerId)), false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    Product.find = oldFind;
    Product.countDocuments = oldCountDocuments;
    User.findById = oldFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("search trims outer whitespace but keeps internal whitespace literal", () => {
  const spaced = buildTextFilter("  ABC 123  ", ["name"]);
  const expression = spaced.$or[0].name;
  assert.equal(expression.test("Product ABC 123"), true);
  assert.equal(expression.test("Product ABC  123"), false);
});
