const mongoose = require("mongoose");

const whatsappLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: String, required: true }, // phone number
    type: {
      type: String,
      enum: ["invoice", "reminder", "broadcast", "marketing", "custom"],
      default: "custom",
    },
    body: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed }, // raw API payload the real Meta call would have sent
    status: {
      type: String,
      enum: ["queued", "mocked", "sent", "failed"], // "mocked" retained only for legacy rows
      default: "queued",
    },
    messageId: { type: String, default: "" }, // provider message id (empty on failure)
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index (Sprint 1.1 — Issue #5): owner-scoped recent delivery log.
whatsappLogSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("WhatsAppLog", whatsappLogSchema);
