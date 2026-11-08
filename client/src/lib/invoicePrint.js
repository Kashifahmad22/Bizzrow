const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  card: "Card",
  credit: "On account",
};

const amount = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const escapeHtml = (value) => String(value == null ? "" : value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function invoiceRows(invoice) {
  const rows = [
    ["Items subtotal", amount(Number(invoice.subtotal) || Number(invoice.total)), ""],
  ];
  if (Number(invoice.itemDiscountTotal) > 0) rows.push(["Line discounts (included above)", `- ${amount(invoice.itemDiscountTotal)}`, "positive"]);
  if (Number(invoice.billDiscountAmount) > 0) {
    const label = invoice.billDiscountType === "percent"
      ? `Bill discount (${invoice.billDiscountValue}%)`
      : "Bill discount";
    rows.push([label, `- ${amount(invoice.billDiscountAmount)}`, "positive"]);
  } else if (Number(invoice.totalDiscount) > 0 && !Number(invoice.itemDiscountTotal)) {
    rows.push(["Discount", `- ${amount(invoice.totalDiscount)}`, "positive"]);
  }
  for (const tax of Array.isArray(invoice.taxBreakdown) ? invoice.taxBreakdown : []) {
    rows.push([tax.label || tax.name || "Tax", amount(tax.amount ?? tax.taxAmount), ""]);
  }
  if (!Array.isArray(invoice.taxBreakdown) || invoice.taxBreakdown.length === 0) {
    for (const [index, item] of (invoice.items || []).entries()) {
      if (Number(item.taxAmount)) rows.push([`Tax - item ${index + 1}`, amount(item.taxAmount), ""]);
    }
  }
  rows.push(["Grand total", amount(invoice.total), "grand"]);
  for (const payment of invoice.payments || []) {
    const label = PAYMENT_LABELS[payment.method] || payment.method;
    rows.push([`${label}${payment.source === "ledger" ? " (later ledger payment)" : ""}`, amount(payment.amount), ""]);
  }
  if (Number(invoice.creditApplied) > 0) rows.push(["Replacement credit applied", amount(invoice.creditApplied), "positive"]);
  rows.push(["Amount paid", amount(invoice.amountPaid), "positive"]);
  rows.push(["Outstanding balance", amount(invoice.dueAmount), Number(invoice.dueAmount) > 0 ? "due" : "positive"]);
  for (const [index, record] of (invoice.returnHistory || []).entries()) {
    rows.push([
      `${record.type === "replacement" ? "Replacement" : "Return"} ${index + 1}`,
      amount(record.refundAmount),
      "positive",
    ]);
    if (Number(record.cashRefund) > 0) rows.push(["Refund paid", amount(record.cashRefund), "positive"]);
    for (const payment of Array.isArray(record.refundPayments) ? record.refundPayments : []) {
      const source = payment.source === "ledger" ? " (ledger)" : payment.source === "credit" ? " (credit)" : "";
      rows.push([`Refund - ${PAYMENT_LABELS[payment.method] || payment.method}${source}`, amount(payment.amount), "positive"]);
    }
    if (Number(record.creditApplied) > 0) rows.push(["Replacement credit used", amount(record.creditApplied), "positive"]);
    if (record.type === "replacement" && Number(record.replacementAmount) > 0) {
      rows.push(["Replacement goods value", amount(record.replacementAmount), ""]);
      rows.push(["Replacement price difference", amount(record.priceDifference), ""]);
    }
  }
  if (Number(invoice.returnedAmount) > 0) {
    rows.push(["Returns / refunds recorded", `- ${amount(invoice.returnedAmount)}`, "positive"]);
    rows.push(["Net sale value after returns", amount(Number(invoice.total) - Number(invoice.returnedAmount)), "grand"]);
  }
  return rows;
}

export function buildInvoicePrintHtml(invoice, format = "a4") {
  if (!["a4", "thermal80", "thermal58"].includes(format)) {
    throw new Error("Choose A4, 80mm, or 58mm print format.");
  }
  const business = invoice.business || {};
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const terms = Array.isArray(invoice.invoiceTerms) ? invoice.invoiceTerms.filter(Boolean) : [];
  const thermal = format !== "a4";
  const width = format === "thermal58" ? "58mm" : "80mm";
  const logo = typeof business.logo === "string" && /^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z\d+/=]+$/i.test(business.logo)
    ? `<img class="logo" src="${business.logo}" alt="">`
    : "";
  const contact = [business.address, business.phone, business.email, business.gstNumber && `GSTIN: ${business.gstNumber}`]
    .filter(Boolean)
    .map((entry) => `<div>${escapeHtml(entry)}</div>`)
    .join("");
  const date = invoice.date ? new Date(invoice.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";
  const itemRows = items.map((item, index) => {
    const meta = [item.sku && `SKU: ${item.sku}`, item.color, item.size].filter(Boolean).map(escapeHtml).join(" · ");
    const itemDiscount = Number(item.discountAmount) > 0
      ? `<div class="sub">Line discount: − ${amount(item.discountAmount)}</div>`
      : "";
    if (thermal) {
      return `<article class="thermal-item">
        <strong>${index + 1}. ${escapeHtml(item.name || "Item")}</strong>
        ${meta ? `<div class="sub">${meta}</div>` : ""}
        <div class="thermal-row"><span>${escapeHtml(item.quantity)} ${escapeHtml(item.unit || "")} × ${amount(item.unitPrice)}</span><strong>${amount(item.subtotal ?? Number(item.unitPrice || 0) * Number(item.quantity || 0))}</strong></div>
        ${itemDiscount}
      </article>`;
    }
    return `<tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.name || "Item")}</strong>${meta ? `<div class="sub">${meta}</div>` : ""}</td>
      <td class="numeric">${escapeHtml(item.quantity)}</td>
      <td>${escapeHtml(item.unit || "")}</td>
      <td class="numeric">${amount(item.unitPrice)}</td>
      <td class="numeric">${Number(item.discountAmount) ? amount(item.discountAmount) : "—"}</td>
      <td class="numeric">${Number(item.taxAmount) ? amount(item.taxAmount) : "—"}</td>
      <td class="numeric">${amount(item.subtotal ?? Number(item.unitPrice || 0) * Number(item.quantity || 0))}</td>
    </tr>`;
  }).join("");
  const summaryRows = invoiceRows(invoice).map(([label, value, kind]) =>
    `<div class="summary-row ${kind}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const termsHtml = terms.length
    ? `<section class="terms"><h2>Terms and conditions</h2><ol>${terms.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol></section>`
    : "";

  const details = `<section class="parties">
    <div><h2>Bill to</h2><strong>${escapeHtml(invoice.customer || "Walk-in Customer")}</strong>
      ${invoice.customerPhone ? `<div>${escapeHtml(invoice.customerPhone)}</div>` : ""}
      ${invoice.customerShopName ? `<div>${escapeHtml(invoice.customerShopName)}</div>` : ""}
      ${invoice.customerAddress ? `<div>${escapeHtml(invoice.customerAddress)}</div>` : ""}
      ${invoice.customerGstNumber ? `<div>GSTIN: ${escapeHtml(invoice.customerGstNumber)}</div>` : ""}
    </div>
    <div class="sale-meta"><div><b>Invoice:</b> ${escapeHtml(invoice.invoiceNumber || "Not assigned")}</div>
      <div><b>Date:</b> ${escapeHtml(date)}</div>
      <div><b>Sale type:</b> ${escapeHtml(invoice.saleType || "wholesale")}</div>
    </div>
  </section>`;

  const itemContent = thermal
    ? `<section class="thermal-items">${itemRows || "<p>No item details recorded.</p>"}</section>`
    : `<table><thead><tr><th>#</th><th>Item / product code</th><th class="numeric">Qty</th><th>Unit</th><th class="numeric">Rate</th><th class="numeric">Disc.</th><th class="numeric">Tax</th><th class="numeric">Line total</th></tr></thead><tbody>${itemRows}</tbody></table>`;
  const taxNotRecorded = !(invoice.taxBreakdown?.length)
    && !items.some((item) => Number(item.taxAmount))
    ? '<p class="tax-note">Tax was not itemized in the saved sale.</p>'
    : "";

  const style = thermal ? `
    @page { size: ${width} auto; margin: 3mm; }
    body { width: ${format === "thermal58" ? "52mm" : "74mm"}; margin: 0 auto; font: ${format === "thermal58" ? "10px" : "11px"} Arial, sans-serif; color: #202438; }
    .brand { text-align: center; } .logo { max-width: 24mm; max-height: 15mm; object-fit: contain; display: block; margin: 0 auto 2mm; }
    h1 { font-size: 15px; margin: 0 0 2mm; overflow-wrap: anywhere; } .contact { color: #555; font-size: 9px; line-height: 1.35; }
    .doc-title { margin: 3mm 0 1mm; text-align: center; font-weight: bold; } .parties { display: block; margin: 2mm 0; }
    .parties h2 { display: none; } .sale-meta { border-top: 1px dashed #888; margin-top: 2mm; padding-top: 2mm; }
    .thermal-items { border-top: 1px dashed #888; border-bottom: 1px dashed #888; }
    .thermal-item { padding: 2mm 0; border-bottom: 1px dotted #bbb; break-inside: avoid; overflow-wrap: anywhere; }
    .thermal-row, .summary-row { display: flex; justify-content: space-between; gap: 2mm; margin: 1mm 0; }
    .thermal-row span, .summary-row span { overflow-wrap: anywhere; }
    .sub { color: #555; font-size: 9px; margin-top: 1mm; overflow-wrap: anywhere; }
    .tax-note { font-size: 8px; color: #666; }
    .summary { border-bottom: 1px dashed #888; padding: 2mm 0; } .grand { font-size: 1.08em; font-weight: bold; border-top: 1px dashed #888; padding-top: 1mm; }
    .positive { color: #176f40; } .due { font-weight: bold; color: #a22; }
    .terms { font-size: 9px; } .terms h2 { font-size: 10px; text-transform: uppercase; }
    .terms ol { padding-left: 4mm; margin: 1mm 0; } .terms li { margin: 1mm 0; overflow-wrap: anywhere; }
    footer { border-top: 1px dashed #888; padding-top: 2mm; text-align: center; font-size: 9px; }
  ` : `
    @page { size: A4; margin: 14mm; }
    body { margin: 0; font: 10pt Arial, sans-serif; color: #202438; } .brand { display: flex; gap: 12px; align-items: flex-start; }
    .logo { max-width: 18mm; max-height: 18mm; object-fit: contain; } h1 { font-size: 22pt; margin: 0 0 3mm; }
    .contact { color: #596176; font-size: 9pt; line-height: 1.4; overflow-wrap: anywhere; }
    .doc-title { margin-left: auto; font-size: 18pt; font-weight: bold; color: #3849f5; text-align: right; }
    .parties { display: flex; justify-content: space-between; gap: 15mm; border-top: 1px solid #dfe3ed; border-bottom: 1px solid #dfe3ed; margin: 8mm 0 5mm; padding: 4mm 0; }
    .parties > div { flex: 1; overflow-wrap: anywhere; } h2 { font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; color: #687087; margin: 0 0 2mm; }
    .sale-meta { text-align: right; } table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
    th { background: #f4f6fb; font-size: 7pt; text-align: left; } th, td { padding: 2.3mm 1.2mm; border-bottom: 1px solid #e6e8f0; vertical-align: top; overflow-wrap: anywhere; }
    .numeric { text-align: right; }     .sub { color: #687087; font-size: 7pt; margin-top: 1mm; }
    .tax-note { color: #687087; font-size: 7pt; margin: 2mm 0 0; }
    .summary { width: min(100%, 90mm); margin: 5mm 0 0 auto; } .summary-row { display: flex; justify-content: space-between; gap: 5mm; padding: 1.2mm 0; }
    .summary-row strong { text-align: right; white-space: nowrap; } .grand { font-size: 11pt; font-weight: bold; border-top: 1px solid #687087; margin-top: 1mm; padding-top: 2mm; }
    .positive { color: #176f40; } .due { font-weight: bold; color: #a22; }
    .terms { margin-top: 7mm; font-size: 8pt; } .terms h2 { font-size: 8pt; } .terms li { margin: 1.5mm 0; break-inside: avoid; }
    footer { margin-top: 10mm; display: flex; justify-content: space-between; color: #687087; font-size: 8pt; }
    thead { display: table-header-group; } tr, .summary, .terms { break-inside: avoid; }
  `;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoiceNumber || "")}</title><style>*{box-sizing:border-box} ${style}</style></head>
    <body><header class="brand">${logo}<div><h1>${escapeHtml(business.name || "Bizzrow")}</h1><div class="contact">${contact}</div></div>${thermal ? "" : '<div class="doc-title">INVOICE</div>'}</header>
    ${thermal ? '<div class="doc-title">INVOICE</div>' : ""}
    ${details}${itemContent}${taxNotRecorded}<section class="summary">${summaryRows}</section>${termsHtml}
    <footer><span>Thank you for your business.</span>${business.phone ? `<span>${escapeHtml(business.phone)}</span>` : ""}</footer>
    <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));</script></body></html>`;
}
