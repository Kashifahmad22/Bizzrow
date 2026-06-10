/**
 * Pure builders for the sales list query (Sprint 1.1 — Issue #1).
 * Extracted so the filtering logic is unit-testable without a DB.
 */

const { escapeRegex } = require("./search");
const { parseRangeStart, parseRangeEnd } = require("./dateRange");

const VALID_STATUS = ["paid", "partial", "unpaid"];

// Build a Mongo filter from query params. `createdAt` is the ONE canonical date field.
function buildSalesFilter({ ownerId, q, status, customerId, from, to }) {
  const filter = { owner: ownerId };
  if (status && VALID_STATUS.includes(status)) filter.paymentStatus = status;
  if (customerId) filter.customer = customerId;
  if (q && String(q).trim()) filter.customerName = new RegExp(escapeRegex(String(q).trim()), "i");

  const start = parseRangeStart(from);
  const end = parseRangeEnd(to);
  if (start || end) {
    filter.createdAt = {};
    if (start) filter.createdAt.$gte = start;
    if (end) filter.createdAt.$lte = end;
  }
  return filter;
}

function resolveSaleSort(sort) {
  switch (sort) {
    case "oldest":
      return { createdAt: 1 };
    case "highest":
      return { total: -1 };
    case "lowest":
      return { total: 1 };
    default:
      return { createdAt: -1 };
  }
}

module.exports = { buildSalesFilter, resolveSaleSort, VALID_STATUS };
