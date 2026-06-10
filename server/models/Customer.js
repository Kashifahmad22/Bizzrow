const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true }, // expect +91XXXXXXXXXX
    shopName: { type: String, default: "" },
    address: { type: String, default: "" },
    pendingBalance: { type: Number, default: 0 }, // positive = customer owes us
    totalPaid: { type: Number, default: 0 },
    totalPurchased: { type: Number, default: 0 },
    lastPurchaseAt: { type: Date },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

customerSchema.index({ owner: 1, phone: 1 }, { unique: true });

// Indexes (Sprint 1.1 — Issue #5): owner-scoped recent list for the ledger page.
customerSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model("Customer", customerSchema);
