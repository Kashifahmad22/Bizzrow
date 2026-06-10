const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: {
      type: String,
      enum: ["sale", "payment", "adjustment", "return"],
      required: true,
    },
    // Positive amounts are debits to the customer (sales),
    // negative amounts are credits (payments received).
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reference: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index (Sprint 1.1 — Issue #5): statement computation reads one customer's
// entries in chronological order.
ledgerEntrySchema.index({ owner: 1, customer: 1, createdAt: 1 });

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
