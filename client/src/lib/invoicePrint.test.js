import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoicePrintHtml } from "./invoicePrint.js";

const invoice = {
  invoiceNumber: "BZR-2026-000001",
  date: "2026-11-07T10:00:00.000Z",
  customer: "Test Customer <script>alert(1)</script>",
  saleType: "wholesale",
  business: { name: "Test Business", email: "test@example.invalid", gstNumber: "TESTGST" },
  items: [{
    name: "Long named product",
    sku: "SKU-1",
    size: "XL",
    unit: "pcs",
    quantity: 2,
    unitPrice: 50,
    discountAmount: 5,
    subtotal: 95,
  }],
  subtotal: 95,
  itemDiscountTotal: 5,
  billDiscountType: "amount",
  billDiscountAmount: 10,
  totalDiscount: 15,
  total: 85,
  payments: [{ method: "cash", amount: 50 }, { method: "upi", amount: 10 }],
  amountPaid: 60,
  dueAmount: 25,
  creditApplied: 0,
  invoiceTerms: ["Historical term"],
};

test("A4 browser print escapes data and uses saved payments, balance, and terms", () => {
  const html = buildInvoicePrintHtml(invoice, "a4");
  assert.match(html, /@page \{ size: A4/);
  assert.match(html, /Test Customer &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /Cash/);
  assert.match(html, /UPI/);
  assert.match(html, /Rs\. 25\.00/);
  assert.match(html, /Historical term/);
  assert.match(buildInvoicePrintHtml({
    ...invoice,
    returnHistory: [{ type: "return", refundAmount: 10, refundPayments: [{ method: "cash", amount: 10 }] }],
  }), /Refund - Cash/);
});

test("thermal browser layouts use dedicated narrow widths", () => {
  assert.match(buildInvoicePrintHtml(invoice, "thermal80"), /size: 80mm auto/);
  assert.match(buildInvoicePrintHtml(invoice, "thermal58"), /size: 58mm auto/);
});

test("unsupported print format fails explicitly", () => {
  assert.throws(() => buildInvoicePrintHtml(invoice, "receipt"), /Choose A4/);
});
