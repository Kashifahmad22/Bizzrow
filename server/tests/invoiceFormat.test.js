const test = require("node:test");
const assert = require("node:assert");
const { formatInvoiceNumber } = require("../utils/invoiceFormat");

test("zero-pads to 6 digits", () => {
  assert.equal(formatInvoiceNumber(2026, 1), "BZR-2026-000001");
  assert.equal(formatInvoiceNumber(2026, 42), "BZR-2026-000042");
});

test("does not truncate large sequences", () => {
  assert.equal(formatInvoiceNumber(2026, 842300), "BZR-2026-842300");
});

test("year is part of the number", () => {
  assert.equal(formatInvoiceNumber(2027, 7), "BZR-2027-000007");
});
