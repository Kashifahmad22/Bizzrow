/**
 * Reusable search helpers (Sprint 1 — Global Search Architecture).
 *
 * Used across products, customers, and sales so search behaves consistently and
 * can be extended to new modules (ledger, etc.) without duplicating logic.
 */

// Escape user input so it is treated as a literal inside a RegExp.
function escapeRegex(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive Mongo $or filter that matches `q` across `fields`.
 * Returns {} when q is empty so callers can spread it safely:
 *   const filter = { owner, ...buildTextFilter(q, ["name", "sku"]) };
 */
function buildTextFilter(q, fields = []) {
  const term = String(q || "").trim();
  if (!term || fields.length === 0) return {};
  const rx = new RegExp(escapeRegex(term), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

module.exports = { escapeRegex, buildTextFilter };
