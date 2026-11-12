const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const test = require("node:test");
const Product = require("../models/Product");
const User = require("../models/User");
const RevokedSession = require("../models/RevokedSession");
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

  // Mirrors the route's optional lite projection (fields=lite → "-image").
  select(projection) {
    this.projection = projection ?? null;
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
    const page = products.slice(this.offset, this.offset + this.pageSize).map((entry) => {
      if (this.projection !== "-image") return entry;
      const { image, ...lite } = entry;
      return lite;
    });
    return Promise.resolve(page).then(resolve, reject);
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
    image: "data:image/png;base64,stub",
    createdAt,
  };
}

test("product search API preserves literal matching, tenant scope, and pagination", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const otherOwnerId = new mongoose.Types.ObjectId();
  const fixtures = [
    product({ id: "lhs-20", owner: ownerId, name: "LHS 20" }),
    product({ id: "lhs-200", owner: ownerId, name: "LHS 200" }),
    product({ id: "lhs-premium", owner: ownerId, name: "LHS 2 Premium" }),
    product({ id: "lhs-hyphen", owner: ownerId, name: "LHS-20" }),
    product({ id: "lhs-nbsp", owner: ownerId, name: "LHS\u00a020" }),
    product({ id: "lhs-line-separator", owner: ownerId, name: "LHS\u202820" }),
    product({ id: "lhs-paragraph-separator", owner: ownerId, name: "LHS\u202920" }),
    product({ id: "unrelated-prefix", owner: ownerId, name: "LTX 20" }),
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
  const oldRevokedExists = RevokedSession.exists;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();

  Product.find = (filter) => new ProductQuery(fixtures.filter((entry) => matchesFilter(entry, filter)));
  Product.countDocuments = async (filter) =>
    fixtures.filter((entry) => matchesFilter(entry, filter)).length;
  User.findById = () => ({
    select: async () => ({ _id: ownerId, tokenVersion: 0 }),
  });
  RevokedSession.exists = async () => null;

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
    const lhs = await search({ q: "LHS" });
    assert.ok(lhs.products.some((entry) => entry._id === "lhs-20"));
    assert.ok(lhs.products.every((entry) => entry.image === "data:image/png;base64,stub"));

    // fields=lite keeps search payloads small by omitting base64 images while
    // preserving pricing and stock details.
    const lite = await search({ q: "LHS", fields: "lite" });
    assert.ok(lite.products.length > 0);
    assert.ok(lite.products.every((entry) => entry.image === undefined));
    assert.ok(lite.products.every((entry) => entry.wholesalePrice === 10 && entry.retailPrice === 20 && entry.stock === 1));

    const lhsTwo = await search({ q: "LHS 2" });
    assert.deepEqual(lhsTwo.products.map((entry) => entry._id).sort(), [
      "lhs-20",
      "lhs-200",
      "lhs-hyphen",
      "lhs-line-separator",
      "lhs-nbsp",
      "lhs-paragraph-separator",
      "lhs-premium",
    ]);

    const lhsFull = await search({ q: "LHS 20" });
    assert.ok(lhsFull.products.some((entry) => entry._id === "lhs-20"));

    const lhsJoined = await search({ q: "LHS2" });
    assert.ok(lhsJoined.products.some((entry) => entry._id === "lhs-20"));

    const spaced = await search({ q: "ABC 123" });
    assert.deepEqual(spaced.products.map((entry) => entry._id).sort(), [
      "barcode",
      "double-space",
      "joined-name",
      "sku",
      "spaced-name",
      "unicode-space",
    ]);

    const trimmed = await search({ q: "\u00a0aBc 123\t" });
    assert.deepEqual(trimmed.products.map((entry) => entry._id).sort(), [
      "barcode",
      "double-space",
      "joined-name",
      "sku",
      "spaced-name",
      "unicode-space",
    ]);

    const joined = await search({ q: "ABC123" });
    assert.deepEqual(joined.products.map((entry) => entry._id).sort(), [
      "barcode",
      "double-space",
      "joined-name",
      "sku",
      "spaced-name",
      "unicode-space",
    ]);

    const repeatedSpace = await search({ q: "ABC  123" });
    assert.deepEqual(repeatedSpace.products.map((entry) => entry._id).sort(), [
      "barcode",
      "double-space",
      "joined-name",
      "sku",
      "spaced-name",
      "unicode-space",
    ]);

    const unicodeSpace = await search({ q: "ABC\u00a0123" });
    assert.deepEqual(unicodeSpace.products.map((entry) => entry._id).sort(), [
      "barcode",
      "double-space",
      "joined-name",
      "sku",
      "spaced-name",
      "unicode-space",
    ]);

    const partialNumeric = await search({ q: "ABC 12" });
    assert.deepEqual(partialNumeric.products.map((entry) => entry._id).sort(), [
      "barcode",
      "double-space",
      "joined-name",
      "sku",
      "spaced-name",
      "unicode-space",
    ]);

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
    RevokedSession.exists = oldRevokedExists;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("product search trims outer whitespace and tolerates internal separator differences", () => {
  const spaced = buildTextFilter("  ABC 123  ", ["name"], { separatorInsensitive: true });
  const expression = spaced.$or[0].name;
  assert.equal(expression.test("Product ABC 123"), true);
  assert.equal(expression.test("Product ABC  123"), true);
  assert.equal(expression.test("Product ABC123"), true);
  assert.equal(expression.test("Product ABC-123"), true);
  assert.equal(expression.test("Product ABC\u00a0123"), true);
  assert.equal(expression.test("Product unrelated"), false);
});

test("other text searches retain literal internal whitespace matching", () => {
  const expression = buildTextFilter("ABC 123", ["name"]).$or[0].name;
  assert.equal(expression.test("Product ABC 123"), true);
  assert.equal(expression.test("Product ABC123"), false);
});

test("serialized product search patterns preserve Unicode separators without PCRE-incompatible escapes", () => {
  for (const query of ["LHS", "LHS 2", "LHS-2", "LHS  2", "LHS\u00a02", "LHS\u20032"]) {
    const filter = buildTextFilter(query, ["name", "sku", "barcode"], { separatorInsensitive: true });
    const serialized = mongoose.mongo.BSON.serialize(filter);
    const decoded = mongoose.mongo.BSON.deserialize(serialized, { bsonRegExp: true });
    for (const clause of decoded.$or) {
      const regex = Object.values(clause)[0];
      assert.equal(regex.options, "i");
      assert.doesNotMatch(regex.pattern, /(?<!\\)(?:\\\\)*\\u[0-9a-f]{4}/i);
    }
    const expression = filter.$or[0].name;
    for (const separator of [" ", "-", "  ", "\u00a0", "\u2003", "\u2028", "\u2029"]) {
      assert.equal(expression.test(`LHS${separator}20`), true, `${JSON.stringify(query)}: ${JSON.stringify(separator)}`);
    }
    assert.equal(expression.test("LTX 20"), false);
    if (query !== "LHS") {
      assert.equal(expression.test("LHS\u202720"), false);
      assert.equal(expression.test("LHS\u202a20"), false);
    }
  }
});

test("product search escapes regex metacharacters and leaves empty queries unfiltered", () => {
  const query = "A.+(B)[C]{2}?^$|\\";
  const expression = buildTextFilter(query, ["name"], { separatorInsensitive: true }).$or[0].name;
  assert.equal(expression.test(`Prefix ${query} suffix`), true);
  assert.equal(expression.test("AxyzBCCC"), false);
  const backslashQuery = "LHS\\u2028";
  const backslashFilter = buildTextFilter(backslashQuery, ["name"], { separatorInsensitive: true });
  const decoded = mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(backslashFilter), { bsonRegExp: true });
  assert.equal(backslashFilter.$or[0].name.test(backslashQuery), true);
  assert.doesNotMatch(decoded.$or[0].name.pattern, /(?<!\\)(?:\\\\)*\\u[0-9a-f]{4}/i);
  assert.deepEqual(buildTextFilter("", ["name"], { separatorInsensitive: true }), {});
  assert.deepEqual(buildTextFilter(" \t\u00a0\u2028", ["name"], { separatorInsensitive: true }), {});
});
