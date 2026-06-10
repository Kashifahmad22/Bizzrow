/**
 * Pure invoice-number formatter (Sprint 1.1 — Issue #2).
 * Format: BZR-<year>-<6-digit zero-padded sequence>  e.g. BZR-2026-000001
 */
function formatInvoiceNumber(year, seq) {
  return `BZR-${year}-${String(seq).padStart(6, "0")}`;
}

module.exports = { formatInvoiceNumber };
