const test = require("node:test");
const assert = require("node:assert");
const { detectProductDuplicates } = require("../utils/productDuplicates");

test("same names with different size or colour are not duplicates", () => {
  const products = [
    { _id: "a", name: "Saree", size: "Free", color: "Red", sku: "A", stock: 3 },
    { _id: "b", name: " saree ", size: "Free", color: "Blue", sku: "B", stock: 4 },
    { _id: "c", name: "Saree", size: "Large", color: "Red", sku: "C", stock: 5 },
  ];
  assert.deepEqual(detectProductDuplicates(products), []);
});

test("exact product variants and repeated identifiers report the matching reason", () => {
  const products = [
    { _id: "a", name: "Saree", size: "Free", color: "Red", sku: "S-1", barcode: "123", stock: 3, sellingPrice: 100 },
    { _id: "b", name: " saree ", size: " free ", color: " RED ", sku: "S-2", barcode: "456", stock: 4, sellingPrice: 120 },
    { _id: "c", name: "Other", sku: "S-1", barcode: "123", stock: 1, sellingPrice: 90 },
  ];
  const before = structuredClone(products);
  const duplicates = detectProductDuplicates(products);
  assert.equal(duplicates.length, 2);
  const exactVariant = duplicates.find((pair) => pair.products[0].name === "Saree" && pair.products[1].name === " saree ");
  assert.deepEqual(exactVariant.matchingFields, ["Same product name, size, and colour"]);
  const repeatedSku = duplicates.find((pair) => pair.products.some((p) => p.sku === "S-1") && pair.products.some((p) => p.name === "Other"));
  assert.deepEqual(repeatedSku.matchingFields, ["Same SKU", "Same barcode"]);
  assert.deepEqual(products, before);
  assert.equal("id" in duplicates[0].products[0], false);
  assert.ok(duplicates.every((pair) => pair.products.every((product) => product.productId.length > 0)));
});

test("same exact name with no variant is a candidate but similar names are not", () => {
  const duplicates = detectProductDuplicates([
    { _id: "1", name: "Cotton Shirt" },
    { _id: "2", name: "Cotton Shirt" },
    { _id: "3", name: "Cotton Shirts" },
  ]);
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].matchingFields, ["Same product name, size, and colour"]);
});
