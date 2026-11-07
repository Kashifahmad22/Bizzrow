const test = require("node:test");
const assert = require("node:assert");
const { buildProductCsv, inventoryFilename } = require("../utils/productExport");

test("product CSV exports every supplied record and includes an unambiguous header", () => {
  const products = Array.from({ length: 205 }, (_, index) => ({
    _id: `internal-${index}`,
    name: `Product ${index + 1}`,
    sellingPrice: 10 + index,
    stock: index,
    createdAt: new Date("2026-11-07T00:00:00.000Z"),
  }));
  const csv = buildProductCsv(products);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 206);
  assert.match(lines[0], /^Product name,SKU,Barcode,Category/);
  assert.match(lines[205], /^Product 205,/);
  assert.doesNotMatch(csv, /internal-/);
});

test("CSV has effective wholesale and retail prices, known cost, and safe missing values", () => {
  const csv = buildProductCsv([{
    name: 'Saree, "Blue"',
    sku: "S-1",
    category: "Textile",
    costPrice: 250.25,
    sellingPrice: 260.5,
    wholesalePrice: 270.75,
    retailPrice: 325.99,
    stock: 65,
    supplier: "Mohan Textiles; Silk House",
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
  }]);
  const row = csv.split("\r\n")[1];
  assert.match(row, /^"Saree, ""Blue""",S-1,,Textile,,,,250\.25,270\.75,325\.99,65,,65,In stock,,Mohan Textiles; Silk House,/);
  assert.match(row, /2026-11-01T10:00:00\.000Z$/);

  const legacy = buildProductCsv([{ name: "=HYPERLINK(\"bad\")", sellingPrice: 5, stock: 0 }]);
  assert.match(legacy.split("\r\n")[1], /^"'=HYPERLINK\(""bad""\)",/);
});

test("inventory filename is business-specific and date-stamped without unsafe characters", () => {
  assert.equal(
    inventoryFilename("Ravi's Shop / West", new Date("2026-11-07T23:00:00.000Z")),
    "ravis-shop-west-inventory-2026-11-07.csv"
  );
});
