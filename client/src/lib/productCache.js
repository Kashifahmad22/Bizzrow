// Small in-memory cache for product list/search responses.
//
// Safety: cached data is display-only. Sale pricing, stock deduction and
// totals are always computed server-side inside the financial transaction, so
// a stale cache entry can never corrupt a sale. Entries expire after a short
// TTL and the whole cache is version-invalidated whenever products change.

const TTL_MS = 30_000;
const MAX_ENTRIES = 50;

let version = 0;
const store = new Map();

export function productCacheKey(params = {}) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");
}

export function getCachedProducts(key, now = Date.now()) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.version !== version || now - entry.time > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedProducts(key, data, now = Date.now()) {
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { data, time: now, version });
}

// Invalidate after any product mutation: create, edit, delete, stock
// adjustment, batch receipt, import commit, Tatkal creation, recorded sale,
// return/replacement — and on manual refresh.
export function invalidateProductCache() {
  version += 1;
  store.clear();
}
