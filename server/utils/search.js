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

function splitSearchTerm(term) {
  return term
    .split(/(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])|[\s\-\u2010-\u2015\u2212]+/i)
    .filter(Boolean);
}

// The range excludes its endpoints so U+2028/U+2029 survive RegExp.source
// without being rewritten as PCRE-incompatible \u escapes.
const SEARCH_SEPARATOR_PATTERN = "(?:[\\s\\-\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff\u2010-\u2015\u2212]|(?![\u2027\u202a])[\u2027-\u202a])*";

/**
 * Build a case-insensitive Mongo $or filter that matches `q` across `fields`.
 * When separatorInsensitive is enabled, whitespace and common hyphens are
 * interchangeable, including between alphabetic and numeric parts.
 * Returns {} when q is empty so callers can spread it safely:
 *   const filter = { owner, ...buildTextFilter(q, ["name", "sku"]) };
 */
function buildTextFilter(q, fields = [], { separatorInsensitive = false } = {}) {
  const term = String(q || "").trim();
  if (!term || fields.length === 0) return {};
  const parts = separatorInsensitive ? splitSearchTerm(term) : [term];
  const separator = separatorInsensitive ? SEARCH_SEPARATOR_PATTERN : "";
  const rx = new RegExp((parts.length ? parts : [term]).map(escapeRegex).join(separator), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

module.exports = { escapeRegex, buildTextFilter };
