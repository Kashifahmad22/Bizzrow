const mongoose = require("mongoose");

const revokedSessionSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date },
}, { timestamps: true });

revokedSessionSchema.index({ owner: 1, tokenHash: 1 }, { unique: true });
revokedSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RevokedSession", revokedSessionSchema);
