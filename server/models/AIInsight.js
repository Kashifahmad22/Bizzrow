const mongoose = require("mongoose");

const aiInsightSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      enum: [
        "daily_summary",
        "top_sellers",
        "slow_movers",
        "reorder_suggestion",
        "customer_signal",
        "low_stock_alert",
        "marketing_copy",
        "health_strength",
        "health_risk",
        "growth_opportunity",
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    severity: {
      type: String,
      enum: ["info", "good", "warn", "critical"],
      default: "info",
    },
    meta: { type: mongoose.Schema.Types.Mixed }, // free-form structured data
  },
  { timestamps: true }
);

aiInsightSchema.index({ owner: 1, kind: 1, createdAt: -1 });

module.exports = mongoose.model("AIInsight", aiInsightSchema);
