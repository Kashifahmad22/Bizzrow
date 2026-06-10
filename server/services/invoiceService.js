/**
 * Invoice numbering service (Sprint 1.1 — Issue #2).
 *
 * Sequential, human-readable, auditable, scalable, concurrency-safe.
 * Sequence is per owner + year, so each business gets BZR-<year>-000001…
 * Historical SV-* invoice numbers are never touched.
 */
const Counter = require("../models/Counter");
const { formatInvoiceNumber } = require("../utils/invoiceFormat");

async function nextInvoiceNumber(ownerId, date = new Date()) {
  const year = date.getFullYear();
  const key = `invoice:${ownerId}:${year}`;
  // Atomic increment (upsert) — safe under concurrent sale creation.
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return formatInvoiceNumber(year, counter.seq);
}

module.exports = { nextInvoiceNumber, formatInvoiceNumber };
