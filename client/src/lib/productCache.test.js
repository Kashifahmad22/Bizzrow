import test from "node:test";
import assert from "node:assert/strict";
import {
  productCacheKey,
  getCachedProducts,
  setCachedProducts,
  invalidateProductCache,
} from "./productCache.js";

test("cache keys are stable regardless of parameter order and skip empty values", () => {
  assert.equal(
    productCacheKey({ q: "shirt", page: 1, limit: 50 }),
    productCacheKey({ limit: 50, page: 1, q: "shirt" }),
  );
  assert.equal(productCacheKey({ q: "", page: 1 }), productCacheKey({ page: 1 }));
  assert.notEqual(productCacheKey({ q: "a", page: 1 }), productCacheKey({ q: "a", page: 2 }));
});

test("cached results are reused while fresh and expire after the TTL", () => {
  invalidateProductCache();
  const key = productCacheKey({ q: "shirt", page: 1 });
  const data = { products: [{ name: "Shirt" }] };
  setCachedProducts(key, data, 1000);
  assert.equal(getCachedProducts(key, 1000 + 29_000), data);
  assert.equal(getCachedProducts(key, 1000 + 31_000), null);
  assert.equal(getCachedProducts("missing", 1000), null);
});

test("invalidation drops every cached entry at once", () => {
  invalidateProductCache();
  setCachedProducts("a", { products: [1] }, 1000);
  setCachedProducts("b", { products: [2] }, 1000);
  invalidateProductCache();
  assert.equal(getCachedProducts("a", 1001), null);
  assert.equal(getCachedProducts("b", 1001), null);
});

test("cache size stays bounded", () => {
  invalidateProductCache();
  for (let i = 0; i < 60; i += 1) setCachedProducts(`key-${i}`, { i }, 1000);
  let kept = 0;
  for (let i = 0; i < 60; i += 1) if (getCachedProducts(`key-${i}`, 1001)) kept += 1;
  assert.ok(kept <= 50);
  assert.deepEqual(getCachedProducts("key-59", 1001), { i: 59 });
});
