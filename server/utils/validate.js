/**
 * Lightweight validation/pagination helpers (Final RC — security + perf).
 */

// Clamp a page-size to a safe range.
function clampLimit(v, def = 25, max = 100) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function clampPage(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

// Positive integer (quantities). Returns 0 for invalid.
function posInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function nonNegNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Build a { page, pages, total } meta object.
function pageMeta(total, page, limit) {
  return { total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}

module.exports = { clampLimit, clampPage, posInt, nonNegNumber, pageMeta };
