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
  // Tax recording and persistence are intentionally deferred to a separate GST implementation.
  const taxBreakdown = Array.isArray(invoice.taxBreakdown) ? invoice.taxBreakdown : [];
  const savedTaxes = taxBreakdown.filter((entry) => entry
    && (entry.amount ?? entry.taxAmount) != null
    && (entry.amount ?? entry.taxAmount) !== ""
    && Number.isFinite(Number(entry.amount ?? entry.taxAmount)));
  if (savedTaxes.length) {
    rows.push(["TAX SUMMARY", "", "tax-header"]);
    for (const entry of savedTaxes) {
      rows.push([entry.label || entry.name || "Tax", amount(entry.amount ?? entry.taxAmount), "tax"]);
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
  const bankDetails = [
    ["Bank name", business.bankDetails?.bankName],
    ["Account holder", business.bankDetails?.accountHolderName],
    ["Account number", business.bankDetails?.accountNumber],
    ["IFSC", business.bankDetails?.ifscCode],
    ["Branch", business.bankDetails?.branchName],
  ].filter(([, value]) => typeof value === "string" && value.trim())
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}:</dt><dd>${escapeHtml(value.trim())}</dd></div>`)
    .join("");
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
    : `<table><thead><tr><th>#</th><th>Item / product code</th><th class="numeric">Qty</th><th>Unit</th><th class="numeric">Rate</th><th class="numeric">Disc.</th><th class="numeric">Line total</th></tr></thead><tbody>${itemRows}</tbody></table>`;
  const printScript = thermal
    ? 'window.addEventListener("load",()=>setTimeout(()=>window.print(),300));'
    : `window.addEventListener("load",()=>setTimeout(()=>{
      const invoice=document.querySelector(".invoice-content");
      const limit=document.createElement("div");
      limit.style.cssText="position:absolute;height:277mm;visibility:hidden;left:-10000px";
      document.body.appendChild(limit);
      const printableHeight=limit.getBoundingClientRect().height;
      limit.remove();
      if(invoice.getBoundingClientRect().height>printableHeight-2){
        document.body.innerHTML="<main role=\\"alert\\" style=\\"font:16px Arial,sans-serif;padding:24px\\">This invoice is too long to print on one A4 page. Reduce the number or length of invoice items or terms and try again.</main>";
        return;
      }
      window.print();
    },300));`;
  const style = thermal ? `
    @page { size: ${width} auto; margin: 3mm; }
    body { width: ${format === "thermal58" ? "52mm" : "74mm"}; margin: 0 auto; font: ${format === "thermal58" ? "10px" : "11px"} Arial, sans-serif; color: #202438; }
    .brand { text-align: center; } .logo { width: 20mm; height: 20mm; object-fit: contain; object-position: center; display: block; margin: 0 auto 2mm; background: #fff; }
    h1 { font-size: 15px; margin: 0 0 2mm; overflow-wrap: anywhere; } .contact { color: #555; font-size: 9px; line-height: 1.35; }
    .doc-title { margin: 3mm 0 1mm; text-align: center; font-weight: bold; } .parties { display: block; margin: 2mm 0; }
    .parties h2 { display: none; } .sale-meta { border-top: 1px dashed #888; margin-top: 2mm; padding-top: 2mm; }
    .thermal-items { border-top: 1px dashed #888; border-bottom: 1px dashed #888; }
    .thermal-item { padding: 2mm 0; border-bottom: 1px dotted #bbb; break-inside: avoid; overflow-wrap: anywhere; }
    .thermal-row, .summary-row { display: flex; justify-content: space-between; gap: 2mm; margin: 1mm 0; }
    .thermal-row span, .summary-row span { overflow-wrap: anywhere; }
    .invoice-bottom { display: flex; flex-direction: column-reverse; }
    .sub { color: #555; font-size: 9px; margin-top: 1mm; overflow-wrap: anywhere; }
    .summary { border-bottom: 1px dashed #888; padding: 2mm 0; } .tax-header { border-top: 1px dashed #888; padding-top: 1mm; margin-top: 2mm; font-size: .9em; font-weight: bold; } .tax-total { font-weight: bold; } .grand { font-size: 1.08em; font-weight: bold; border-top: 1px dashed #888; padding-top: 1mm; }
    .bank-details { border-top: 1px dashed #888; padding-top: 2mm; margin-top: 2mm; } .bank-details h2 { font-size: 10px; text-transform: uppercase; } .bank-details dl { margin: 0; } .bank-details dl > div { display: flex; gap: 2mm; margin: 1mm 0; overflow-wrap: anywhere; } .bank-details dt { font-weight: bold; } .bank-details dd { margin: 0; overflow-wrap: anywhere; }
    .positive { color: #176f40; } .due { font-weight: bold; color: #a22; }
    .terms { font-size: 9px; } .terms h2 { font-size: 10px; text-transform: uppercase; }
    .terms ol { padding-left: 4mm; margin: 1mm 0; } .terms li { margin: 1mm 0; overflow-wrap: anywhere; }
    footer { border-top: 1px dashed #888; padding-top: 2mm; text-align: center; font-size: 9px; }
  ` : `
    @page { size: A4 portrait; margin: 10mm; }
    body { margin: 0; font: 9pt Arial, sans-serif; color: #202438; } .brand { display: flex; gap: 8px; align-items: flex-start; }
    .logo { width: 19mm; height: 19mm; object-fit: contain; object-position: center; background: #fff; flex: 0 0 auto; } h1 { font-size: 18pt; margin: 0 0 2mm; }
    .contact { color: #596176; font-size: 7.5pt; line-height: 1.25; overflow-wrap: anywhere; }
    .doc-title { margin-left: auto; font-size: 18pt; font-weight: bold; color: #3849f5; text-align: right; }
    .parties { display: flex; justify-content: space-between; gap: 10mm; border-top: 1px solid #dfe3ed; border-bottom: 1px solid #dfe3ed; margin: 3mm 0 2mm; padding: 1.5mm 0; }
    .parties > div { flex: 1; overflow-wrap: anywhere; } h2 { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #687087; margin: 0 0 1mm; }
    .sale-meta { text-align: right; } table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
    th { background: #f4f6fb; font-size: 7pt; text-align: left; } th, td { padding: 1mm 1mm; border-bottom: 1px solid #e6e8f0; vertical-align: top; overflow-wrap: anywhere; }
    .numeric { text-align: right; } .sub { color: #687087; font-size: 6.5pt; margin-top: .5mm; }
    .invoice-bottom { display: grid; grid-template-columns: minmax(0, 1fr) minmax(72mm, 88mm); gap: 8mm; align-items: start; margin-top: 2mm; }
    .summary { min-width: 0; margin: 0; } .summary-row { display: flex; justify-content: space-between; gap: 4mm; padding: .65mm 0; font-size: 7.5pt; }
    .summary-row strong { text-align: right; white-space: nowrap; } .grand { font-size: 9.5pt; font-weight: bold; border-top: 1px solid #687087; margin-top: .5mm; padding-top: 1mm; }
    .tax-header { border-top: 1px solid #dfe3ed; padding-top: 1mm; margin-top: 1mm; color: #687087; font-size: 6.5pt; font-weight: bold; letter-spacing: .04em; } .tax { color: #687087; font-size: 7pt; }
    .bank-details { min-width: 0; margin: 0; padding: 1mm 0 0; break-inside: avoid; } .bank-details h2 { margin: 0 0 1.5mm; } .bank-details dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5mm 4mm; margin: 0; } .bank-details dl > div { display: flex; flex-wrap: wrap; gap: 1mm; min-width: 0; overflow-wrap: anywhere; font-size: 7pt; } .bank-details dt { color: #687087; font-size: 6.5pt; } .bank-details dd { margin: 0; overflow-wrap: anywhere; }
    .positive { color: #176f40; } .due { font-weight: bold; color: #a22; }
    .terms { margin-top: 2mm; font-size: 6.8pt; line-height: 1.2; } .terms h2 { font-size: 7pt; } .terms ol { margin: 1mm 0 0; padding-left: 4mm; } .terms li { margin: .5mm 0; break-inside: avoid; }
    footer { margin-top: 2mm; padding-top: 1.5mm; border-top: 1px solid #dfe3ed; display: flex; justify-content: space-between; align-items: end; gap: 4mm; color: #687087; font-size: 7pt; }
    .signature { min-width: 32mm; border-top: 1px solid #687087; padding-top: 1mm; text-align: center; }
    thead { display: table-header-group; } tr, .invoice-bottom, .summary, .terms, footer { break-inside: avoid; }
  `;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoiceNumber || "")}</title><style>*{box-sizing:border-box} ${style}</style></head>
    <body><main class="invoice-content"><header class="brand">${logo}<div><h1>${escapeHtml(business.name || "Bizzrow")}</h1><div class="contact">${contact}</div></div>${thermal ? "" : '<div class="doc-title">INVOICE</div>'}</header>
    ${thermal ? '<div class="doc-title">INVOICE</div>' : ""}
    ${details}${itemContent}<section class="invoice-bottom">${bankDetails ? `<section class="bank-details"><h2>Bank details</h2><dl>${bankDetails}</dl></section>` : "<div></div>"}<section class="summary">${summaryRows}</section></section>${termsHtml}
    <footer><span>Thank you for your business.${business.phone ? ` Contact: ${escapeHtml(business.phone)}` : ""}</span><span class="signature">Authorized signature</span></footer></main>
    <script>${printScript}</script></body></html>`;
}
