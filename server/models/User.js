const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    business: {
      name: { type: String, default: "" },
      ownerName: { type: String, default: "" },
      logo: { type: String, default: "" }, // base64 data URL — primary visual identity
      gstNumber: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      bankDetails: {
        bankName: { type: String, default: "" },
        accountHolderName: { type: String, default: "" },
        accountNumber: { type: String, default: "" },
        ifscCode: { type: String, default: "" },
        branchName: { type: String, default: "" },
      },
      upiId: { type: String, default: "" }, // e.g. shop@okhdfcbank
      upiQr: { type: String, default: "" }, // base64 data URL
      currency: { type: String, default: "INR" },
      invoiceReturnPeriodDays: { type: Number, min: 0, max: 365, default: 7 },
      invoiceTerms: {
        type: [String],
        default: [
          "Return or exchange requests may be considered within {returnPeriodDays} days of the invoice date, subject to the policy communicated at purchase and applicable law.",
          "Please report any damage or shortage promptly for review.",
          "Goods showing signs of use, washing, alteration, or customer-caused damage may not be eligible for return or exchange, subject to applicable law.",
          "Wholesale and retail goods are governed by the return and exchange policy communicated at purchase and applicable law.",
        ],
      },
    },
    preferences: {
      whatsappAutoInvoice: { type: Boolean, default: true },
      whatsappReminders: { type: Boolean, default: true },
      lowStockThreshold: { type: Number, default: 5 },
      theme: { type: String, enum: ["dark", "light"], default: "dark" },
    },
    tokenVersion: { type: Number, default: 0 },
    // Password reset (Sprint 1) — store only the SHA-256 hash of the token.
    resetTokenHash: { type: String, default: "" },
    resetTokenExpiresAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

userSchema.methods.matchPassword = function matchPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
