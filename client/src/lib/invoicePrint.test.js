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
  assert.match(html, /@page \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) minmax\(72mm, 88mm\)/);
  assert.match(html, /Authorized signature/);
  assert.match(html, /height:277mm/);
  assert.match(html, /printableHeight-2/);
  assert.match(html, /too long to print on one A4 page/);
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

test("A4 and thermal print invoices show optional bank details and existing tax entries only", () => {
  for (const format of ["a4", "thermal80", "thermal58"]) {
    const html = buildInvoicePrintHtml({
      ...invoice,
      business: {
        ...invoice.business,
        bankDetails: {
          bankName: "Example Bank",
          accountHolderName: "Example Holder",
          accountNumber: "001234",
          ifscCode: "EXAM0001234",
          branchName: "Main Branch",
        },
      },
      taxBreakdown: [{ label: "CGST", amount: 6 }, { label: "SGST", amount: 6 }],
    }, format);
    assert.match(html, /Bank details/);
    for (const value of ["Example Bank", "Example Holder", "001234", "EXAM0001234", "Main Branch"]) {
      assert.ok(html.includes(value), `${format}: missing ${value}`);
    }
    assert.match(html, /CGST/);
    assert.match(html, /SGST/);
    assert.ok(html.indexOf("TAX SUMMARY") < html.indexOf("Grand total"));
    assert.doesNotMatch(html, /<th[^>]*>Tax<\/th>/);
    assert.doesNotMatch(html, /Tax - item/);
    assert.match(html, /Rs\. 85\.00/);
    if (format !== "a4") assert.match(html, /\.invoice-bottom \{ display: flex; flex-direction: column-reverse; \}/);
  }
});

test("browser print omits tax presentation when no saved breakdown exists", () => {
  const html = buildInvoicePrintHtml(invoice, "a4");
  assert.doesNotMatch(html, /TAX SUMMARY|CGST|SGST|IGST|Not recorded/);
});

test("thermal browser layouts do not apply the A4 page-length guard", () => {
  for (const format of ["thermal80", "thermal58"]) {
    const html = buildInvoicePrintHtml(invoice, format);
    assert.doesNotMatch(html, /too long to print on one A4 page/);
  }
});

test("browser print hides empty bank details and contains logos in consistent frames", () => {
  const missing = buildInvoicePrintHtml(invoice, "a4");
  assert.doesNotMatch(missing, /Bank details/);
  const partial = buildInvoicePrintHtml({
    ...invoice,
    business: { ...invoice.business, bankDetails: { bankName: "Partial Bank" } },
  }, "thermal58");
  assert.match(partial, /Partial Bank/);
  assert.doesNotMatch(partial, /Account holder|Account number|IFSC|Branch/);

  const logo = "data:image/png;base64,AAAA";
  for (const format of ["a4", "thermal80", "thermal58"]) {
    const html = buildInvoicePrintHtml({
      ...invoice,
      business: { ...invoice.business, logo },
    }, format);
    assert.match(html, /object-fit: contain/);
    assert.match(html, /object-position: center/);
    assert.match(html, /width: (19|20)mm; height: \1mm/);
    assert.match(html, /background: #fff/);
  }
});

test("unsupported print format fails explicitly", () => {
  assert.throws(() => buildInvoicePrintHtml(invoice, "receipt"), /Choose A4/);
});
