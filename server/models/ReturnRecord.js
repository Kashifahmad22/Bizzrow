const mongoose = require("mongoose");

// Audit trail for returns and replacements (Final RC — Phase C).
// One record per return/replacement event, linked to the original sale.
const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, default: "" }, // snapshot
    quantity: { type: Number, required: true, min: 1 },
    unitNet: { type: Number, default: 0 }, // net unit price refunded
    refund: { type: Number, default: 0 }, // quantity * unitNet
  },
  { _id: false }
);

const returnRecordSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    invoiceNumber: { type: String, default: "" }, // snapshot of the original invoice
    type: { type: String, enum: ["return", "replacement"], default: "return" },
    items: { type: [returnItemSchema], default: [] },
    refundAmount: { type: Number, default: 0 }, // value of returned goods
    reason: { type: String, default: "" },
    notes: { type: String, default: "" },
    // Replacement-only:
    replacementSale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
    replacementAmount: { type: Number, default: 0 }, // value of the new (replacement) goods
    priceDifference: { type: Number, default: 0 }, // replacementAmount - refundAmount (>0 customer pays)
  },
  { timestamps: true }
);

returnRecordSchema.index({ owner: 1, createdAt: -1 });
returnRecordSchema.index({ owner: 1, sale: 1, createdAt: 1 });

module.exports = mongoose.model("ReturnRecord", returnRecordSchema);
