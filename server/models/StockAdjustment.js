const mongoose = require("mongoose");

const stockAdjustmentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  batch: { type: mongoose.Schema.Types.ObjectId, ref: "StockBatch", default: null },
  delta: { type: Number, required: true },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  stockBefore: { type: Number, required: true },
  stockAfter: { type: Number, required: true },
  sourceBefore: { type: Number, required: true },
  sourceAfter: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model("StockAdjustment", stockAdjustmentSchema);
