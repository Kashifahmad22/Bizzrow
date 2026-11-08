const mongoose = require("mongoose");

const stockBatchSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    batchCode: { type: String, required: true, trim: true },
    purchaseDate: { type: Date, required: true },
    quantityReceived: { type: Number, required: true, min: 0.000001 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, default: null, min: 0 },
    supplierName: { type: String, default: "", trim: true },
    purchaseReference: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

stockBatchSchema.index({ owner: 1, product: 1, purchaseDate: 1, createdAt: 1 });

module.exports = mongoose.model("StockBatch", stockBatchSchema);
