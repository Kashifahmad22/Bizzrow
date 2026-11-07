const test = require("node:test");
const assert = require("node:assert/strict");
const PDFDocument = require("pdfkit");
const { buildInvoicePdfDocument, invoiceRows } = require("../services/invoicePdf");

function fixture(overrides = {}) {
  return {
    invoiceNumber: "BZR-2026-001234",
    createdAt: "2026-11-07T10:00:00.000Z",
    customerName: "Test Retail Customer",
    customerType: "existing",
    saleType: "retail",
    items: [{
      name: "Very long test product name for wrapping on A4 and narrow thermal paper",
      sku: "TEST-001",
      color: "Navy",
      size: "XL",
      unit: "pcs",
      quantity: 2,
      unitPrice: 125,
      discountAmount: 25,
      subtotal: 225,
      taxAmount: 0,
    }],
    subtotal: 225,
    itemDiscountTotal: 25,
    billDiscountType: "percent",
    billDiscountValue: 10,
    billDiscountAmount: 22.5,
    totalDiscount: 47.5,
    total: 202.5,
    payments: [
      { method: "cash", amount: 100 },
      { method: "upi", amount: 50 },
    ],
    amountPaid: 150,
    dueAmount: 52.5,
    creditApplied: 0,
    returnedAmount: 0,
    invoiceTermsSnapshot: ["Test term one.", "Test term two."],
    ...overrides,
  };
}

function pageCount(pdf) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

test("A4 invoice is a PDF and paginates large catalogues with saved totals", async () => {
  const sale = fixture({ items: Array.from({ length: 80 }, (_, index) => ({
    ...fixture().items[0],
    name: `Long product ${index + 1} - ${"detailed item description ".repeat(3)}`,
  })) });
  const pdf = await buildInvoicePdfDocument(sale, { name: "Test Business", gstNumber: "TESTGST" }, {
    name: "Test Customer",
    phone: "9000000000",
    address: "Test billing address",
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /595\.28\s+841\.89/);
  assert.ok(pageCount(pdf) > 1);
  assert.deepEqual(invoiceRows(fixture()).filter((row) => row[0] === "Grand total")[0], ["Grand total", "Rs. 202.50", "grand"]);
  assert.ok(invoiceRows(fixture()).some((row) => row[0] === "Cash" && row[1] === "Rs. 100.00"));
  assert.ok(invoiceRows(fixture()).some((row) => row[0] === "UPI" && row[1] === "Rs. 50.00"));
  assert.ok(invoiceRows(fixture()).some((row) => row[0] === "Outstanding balance" && row[1] === "Rs. 52.50"));
});

test("80mm and 58mm invoices use narrow receipt page widths", async () => {
  for (const [format, width] of [["thermal80", "226.77"], ["thermal58", "164.41"]]) {
    const pdf = await buildInvoicePdfDocument(fixture(), { name: "Test Shop", phone: "9000000000" }, {}, { format });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.match(pdf.toString("latin1"), new RegExp(`${width}\\s`));
    assert.equal(pageCount(pdf), 1);
  }
});

test("thermal rows reserve space for wrapped labels and amounts", async () => {
  const sale = fixture({
    items: [{ ...fixture().items[0], quantity: 123456789, unitPrice: 123456789, subtotal: 123456789012345 }],
    subtotal: 123456789012345,
    total: 123456789012345,
    amountPaid: 123456789012345,
    payments: [{ method: "cash", amount: 123456789012345, source: "ledger" }],
  });
  const originalText = PDFDocument.prototype.text;
  const calls = [];
  PDFDocument.prototype.text = function (text, x, y, options) {
    const page = this.page;
    const result = originalText.call(this, text, x, y, options);
    calls.push({ text, start: y, end: this.y, page, pageHeight: page.height });
    return result;
  };
  try {
    for (const format of ["thermal58", "thermal80"]) {
      calls.length = 0;
      const pdf = await buildInvoicePdfDocument(sale, { name: "Test Shop" }, {}, { format });
      assert.equal(pageCount(pdf), 1, `${format} must keep the entire receipt on one page`);
      const itemIndex = calls.findIndex((call) => call.text.startsWith("123456789 pcs x "));
      assert.notEqual(itemIndex, -1, `${format}: missing item price row`);
      const nextItemRow = calls.slice(itemIndex + 2).find((call) => call.text === "  Line discount");
      assert.ok(nextItemRow, `${format}: missing item discount`);
      assert.ok(nextItemRow.start >= Math.max(calls[itemIndex].end, calls[itemIndex + 1].end),
        `${format}: item price overlaps line discount`);
      const rows = invoiceRows(sale);
      let index = 0;
      for (let row = 0; row < rows.length; row++) {
        index = calls.findIndex((call, i) => i >= index && call.text === rows[row][0]);
        assert.notEqual(index, -1, `${format}: missing ${rows[row][0]}`);
        const label = calls[index];
        const value = calls[index + 1];
        assert.equal(value.text, rows[row][1]);
        assert.equal(label.start, value.start);
        const nextLabel = row + 1 < rows.length ? rows[row + 1][0] : "TERMS";
        const next = calls.slice(index + 2).find((call) => call.text === nextLabel);
        assert.ok(next, `${format}: missing following row ${nextLabel}`);
        assert.equal(label.page, next.page);
        assert.ok(next.start >= Math.max(label.end, value.end),
          `${format}: ${rows[row][0]} overlaps ${nextLabel}`);
        index += 2;
      }
      const footer = calls.find((call) => call.text === "Thank you for your business");
      assert.ok(footer && footer.end <= footer.pageHeight, `${format}: footer must fit on receipt`);
    }
  } finally {
    PDFDocument.prototype.text = originalText;
  }
});

test("invoice rows use the saved totals and do not infer missing GST", () => {
  const rows = invoiceRows(fixture());
  assert.ok(rows.some((row) => row[0] === "Bill discount (10%)" && row[1] === "- Rs. 22.50"));
  assert.equal(rows.some((row) => row[0].includes("Tax")), false);
  assert.ok(rows.some((row) => row[0] === "Outstanding balance" && row[1] === "Rs. 52.50"));
});

test("legacy zero-default subtotal falls back to saved sale total and recorded adjustments are shown", () => {
  const rows = invoiceRows(fixture({
    subtotal: 0,
    total: 1100,
    returnedAmount: 100,
    returnHistory: [{
      type: "return",
      createdAt: "2026-11-08T10:00:00.000Z",
      refundAmount: 100,
      refundPayments: [{ method: "upi", amount: 100, source: "sale" }],
    }],
  }));
  assert.ok(rows.some((row) => row[0] === "Items subtotal (after line discounts)" && row[1] === "Rs. 1,100.00"));
  assert.ok(rows.some((row) => row[0].startsWith("Return 1") && row[1] === "Rs. 100.00"));
  assert.ok(rows.some((row) => row[0] === "Return refund - UPI" && row[1] === "Rs. 100.00"));
  assert.ok(rows.some((row) => row[0] === "Net sale value after returns" && row[1] === "Rs. 1,000.00"));
});
