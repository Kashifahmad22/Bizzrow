import test from "node:test";
import assert from "node:assert/strict";
import { duplicatePairKey, normalizeDuplicateGroups } from "./duplicateReview.js";

test("duplicate groups normalize current and legacy persisted ID fields", () => {
  const groups = normalizeDuplicateGroups([{
    products: [
      { productId: "product-a", name: "A" },
      { _id: "product-b", name: "B" },
    ],
    matchingFields: ["Same SKU"],
  }]);

  assert.deepEqual(groups[0].products.map((product) => product.productId), ["product-a", "product-b"]);
});

test("group keys are stable, unique, and based on member product IDs", () => {
  const [first, second] = normalizeDuplicateGroups([
    { products: [{ id: "a" }, { id: "b" }] },
    { products: [{ id: "c" }, { id: "d" }] },
  ]);
  assert.equal(duplicatePairKey(first), duplicatePairKey({ products: [...first.products].reverse() }));
  assert.notEqual(duplicatePairKey(first), duplicatePairKey(second));
});

test("missing and duplicate member IDs are rejected instead of producing empty keys", () => {
  assert.throws(
    () => normalizeDuplicateGroups([{ products: [{}, {}] }]),
    /missing product IDs/
  );
  assert.throws(
    () => normalizeDuplicateGroups([{ products: [{ id: "same" }, { productId: "same" }] }]),
    /same product twice/
  );
});
