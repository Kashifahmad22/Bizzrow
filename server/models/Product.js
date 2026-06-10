const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "Apparel" },
    color: { type: String, default: "" },
    size: { type: String, default: "" }, // e.g. "M", "L", "XL"
    sku: { type: String, default: "" },
    // Unified product creation (Master Sprint) — all additive / optional.
    brand: { type: String, default: "" },
    unit: { type: String, default: "pcs" }, // pcs, box, kg, mtr…
    gstPct: { type: Number, default: 0, min: 0 }, // captured at product level only (no sale GST)
    hsn: { type: String, default: "" },
    marginPct: { type: Number, default: 0 }, // cost + marginPct => sellingPrice
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    image: { type: String, default: "" }, // base64 data URL
    soldCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.virtual("margin").get(function margin() {
  if (!this.sellingPrice) return 0;
  return Number((this.sellingPrice - this.costPrice).toFixed(2));
});

productSchema.virtual("marginPercent").get(function marginPercent() {
  if (!this.sellingPrice) return 0;
  return Number(((this.sellingPrice - this.costPrice) / this.sellingPrice * 100).toFixed(2));
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

// Indexes (Sprint 1.1 — Issue #5): owner-scoped list + name lookups for search.
productSchema.index({ owner: 1, createdAt: -1 });
productSchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model("Product", productSchema);
