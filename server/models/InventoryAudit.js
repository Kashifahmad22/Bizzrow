const mongoose = require("mongoose");

const sourceSchema = new mongoose.Schema({
  batch: { type: mongoose.Schema.Types.ObjectId, ref: "StockBatch", default: null },
  batchCode: { type: String, default: "" },
  systemQuantity: { type: Number, required: true },
  physicalQuantity: { type: Number, default: null },
  difference: { type: Number, default: null },
  reason: { type: String, default: "" },
  adjustment: { type: mongoose.Schema.Types.ObjectId, ref: "StockAdjustment", default: null },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  systemStock: { type: Number, required: true },
  stockRevision: { type: Number, required: true },
  sources: { type: [sourceSchema], required: true },
}, { _id: false });

const inventoryAuditSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["draft", "completed"], default: "draft" },
  remarks: { type: String, default: "", maxlength: 500 },
  items: { type: [itemSchema], required: true },
  completedAt: { type: Date },
}, { timestamps: true });

inventoryAuditSchema.index({ owner: 1, createdAt: -1 });
module.exports = mongoose.model("InventoryAudit", inventoryAuditSchema);
