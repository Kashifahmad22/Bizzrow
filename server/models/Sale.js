const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true }, // snapshot at time of sale
    sku: { type: String, default: "" },
    unit: { type: String, default: "" },
    size: String,
    color: String,
    wholesalePrice: { type: Number, min: 0 },
    retailPrice: { type: Number, min: 0 },
    batchAllocations: [{
      batch: { type: mongoose.Schema.Types.ObjectId, ref: "StockBatch", required: true },
      quantity: { type: Number, required: true, min: 0 },
      costPrice: { type: Number, default: null, min: 0 },
    }],
    legacyQuantityFirst: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    // Item-level discount (Master Sprint). Backward compatible: defaults to none.
    discountType: { type: String, enum: ["percent", "amount"], default: "amount" },
    discountValue: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 }, // computed ₹ off this line
    gross: { type: Number, default: 0, min: 0 }, // unitPrice * quantity (before discount)
    subtotal: { type: Number, required: true, min: 0 }, // net (after item discount)
    costPrice: { type: Number, min: 0 }, // cost snapshot at sale time (profit engine)
    returnedQty: { type: Number, default: 0, min: 0 }, // units returned (returns v1)
  },
  { _id: false }
);

// A single payment split (e.g. ₹2000 cash + ₹3000 UPI on one bill)
const paymentSplitSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ["cash", "upi", "bank", "card", "credit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ["sale", "ledger"], default: "sale" },
    collectedAt: { type: Date },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Optional: walk-in customers have no Customer document and no ledger.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true, default: null },
    customerName: { type: String, required: true }, // snapshot ("Walk-in Customer" for walk-ins)
    customerPhoneSnapshot: { type: String, default: "" },
    customerShopNameSnapshot: { type: String, default: "" },
    customerAddressSnapshot: { type: String, default: "" },
    customerGstNumberSnapshot: { type: String, default: "" },
    customerType: {
      type: String,
      enum: ["existing", "new", "walkin"],
      default: "existing",
    },
    saleType: { type: String, enum: ["wholesale", "retail"], default: "wholesale" },
    items: { type: [saleItemSchema], default: [] },
    // Discount rollups (Master Sprint). For legacy sales these default to 0 and
    // subtotal is treated as equal to total on read.
    subtotal: { type: Number, default: 0, min: 0 }, // sum of item net subtotals
    itemDiscountTotal: { type: Number, default: 0, min: 0 },
    billDiscountType: { type: String, enum: ["percent", "amount"], default: "amount" },
    billDiscountValue: { type: Number, default: 0, min: 0 },
    billDiscountAmount: { type: Number, default: 0, min: 0 },
    totalDiscount: { type: Number, default: 0, min: 0 }, // item + bill discount in ₹
    total: { type: Number, required: true, min: 0 }, // payable after all discounts
    // Returns v1 (additive). returnedAmount reduces realized revenue + profit.
    returnedAmount: { type: Number, default: 0, min: 0 },
    returnStatus: { type: String, enum: ["none", "partial", "full"], default: "none" },
    creditApplied: { type: Number, default: 0, min: 0 },
    creditSources: [{
      sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true },
      amount: { type: Number, required: true, min: 0 },
    }],
    // Payment splits record collected amounts; credit is tracked separately.
    payments: { type: [paymentSplitSchema], default: [] },
    collectionPayments: { type: [paymentSplitSchema], default: undefined, immutable: true },
    cashTendered: { type: Number, min: 0, default: undefined, immutable: true },
    cashChange: { type: Number, min: 0, default: undefined, immutable: true },
    amountPaid: { type: Number, default: 0, min: 0 },
    dueAmount: { type: Number, default: 0, min: 0 },
    // Summary method: a single method, or "split" when more than one was used.
    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "bank", "card", "credit", "split"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "partial", "unpaid"],
      default: "paid",
    },
    invoiceNumber: { type: String, index: true },
    invoiceTermsSnapshot: { type: [String], default: [] },
    invoiceReturnPeriodDaysSnapshot: { type: Number, default: null, min: 0, max: 365 },
    notes: { type: String, default: "" },
    // Replacement linkage (Final RC): set on the new sale created by a replacement.
    replacementOf: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
  },
  { timestamps: true }
);

// Indexes (Sprint 1.1 — Issue #5): support the sales date / status / customer filters.
saleSchema.index({ owner: 1, createdAt: -1 });
saleSchema.index({ owner: 1, customer: 1, createdAt: -1 });
saleSchema.index({ owner: 1, paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Sale", saleSchema);
