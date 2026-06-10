const mongoose = require("mongoose");

/**
 * Atomic sequence counters (Sprint 1.1 — Issue #2: invoice numbering).
 * _id is a namespaced key, e.g. "invoice:<ownerId>:<year>".
 * Incremented with an atomic findOneAndUpdate($inc) so it is concurrency-safe.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Counter", counterSchema);
