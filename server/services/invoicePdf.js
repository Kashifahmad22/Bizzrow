const PDFDocument = require("pdfkit");

const COLORS = {
  ink: "#202438",
  muted: "#687087",
  brand: "#3849f5",
  line: "#dfe3ed",
  pale: "#f4f6fb",
  green: "#16834b",
  red: "#bd3434",
};

const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  card: "Card",
  credit: "On account",
};

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const currency = (value) => `Rs. ${number(value).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

function printable(value, fallback = "") {
  return String(value == null || value === "" ? fallback : value)
    .replace(/[₹]/g, "Rs.")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "Not recorded";
}

function imageBuffer(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,([A-Za-z\d+/=]+)$/i);
  return match ? Buffer.from(match[2], "base64") : null;
}

function termsForSale(sale) {
  return Array.isArray(sale.invoiceTermsSnapshot)
    ? sale.invoiceTermsSnapshot.filter((term) => typeof term === "string" && term.trim())
    : [];
}

function taxLines(sale) {
  const rows = [];
  for (const entry of Array.isArray(sale.taxBreakdown) ? sale.taxBreakdown : []) {
    if (entry && Number.isFinite(Number(entry.amount ?? entry.taxAmount))) {
      rows.push({
        label: printable(entry.label || entry.name || "Tax"),
        amount: number(entry.amount ?? entry.taxAmount),
      });
    }
  }
  if (rows.length) return rows;
  for (const [index, item] of (sale.items || []).entries()) {
    if (Number.isFinite(Number(item.taxAmount)) && number(item.taxAmount) !== 0) {
      rows.push({
        label: `Tax${item.taxRate != null ? ` (${item.taxRate}%)` : ""} - item ${index + 1}`,
        amount: number(item.taxAmount),
      });
    }
  }
  return rows;
}

function invoiceRows(sale) {
  const rows = [];
  rows.push(["Items subtotal (after line discounts)", currency(number(sale.subtotal) || number(sale.total))]);
  if (number(sale.itemDiscountTotal) > 0) {
    rows.push(["Line discounts (included above)", `- ${currency(sale.itemDiscountTotal)}`]);
  }
  if (number(sale.billDiscountAmount) > 0) {
    const discount = sale.billDiscountType === "percent"
      ? `Bill discount (${number(sale.billDiscountValue)}%)`
      : "Bill discount";
    rows.push([discount, `- ${currency(sale.billDiscountAmount)}`]);
  }
  if (number(sale.totalDiscount) > 0 && !number(sale.itemDiscountTotal) && !number(sale.billDiscountAmount)) {
    rows.push(["Discount", `- ${currency(sale.totalDiscount)}`]);
  }
  for (const tax of taxLines(sale)) rows.push([tax.label, currency(tax.amount)]);
  rows.push(["Grand total", currency(sale.total), "grand"]);

  for (const payment of Array.isArray(sale.payments) ? sale.payments : []) {
    const label = PAYMENT_LABELS[payment.method] || printable(payment.method, "Payment");
    rows.push([`${label}${payment.source === "ledger" ? " (later ledger payment)" : ""}`, currency(payment.amount), "payment"]);
  }
  if (number(sale.creditApplied) > 0) rows.push(["Replacement credit applied", currency(sale.creditApplied), "credit"]);
  rows.push(["Amount paid", currency(sale.amountPaid)]);
  rows.push(["Outstanding balance", currency(sale.dueAmount), number(sale.dueAmount) > 0 ? "due" : ""]);
  for (const [index, record] of (sale.returnHistory || []).entries()) {
    const type = record.type === "replacement" ? "Replacement" : "Return";
    rows.push([`${type} ${index + 1} - ${dateLabel(record.createdAt)}`, currency(record.refundAmount), "credit"]);
    if (number(record.cashRefund) > 0) rows.push([`${type} refund paid`, currency(record.cashRefund), "credit"]);
    for (const payment of Array.isArray(record.refundPayments) ? record.refundPayments : []) {
      const source = payment.source === "ledger" ? " (ledger)" : payment.source === "credit" ? " (credit)" : "";
      rows.push([`${type} refund - ${PAYMENT_LABELS[payment.method] || payment.method}${source}`, currency(payment.amount), "credit"]);
    }
    if (number(record.creditApplied) > 0) rows.push(["Replacement credit used", currency(record.creditApplied), "credit"]);
    if (record.type === "replacement" && number(record.replacementAmount) > 0) {
      rows.push(["Replacement goods value", currency(record.replacementAmount)]);
      rows.push(["Replacement price difference", currency(record.priceDifference)]);
    }
  }
  if (number(sale.returnedAmount) > 0) {
    rows.push(["Returns / refunds recorded", `- ${currency(sale.returnedAmount)}`, "credit"]);
  }
  if (number(sale.returnedAmount) > 0) {
    rows.push(["Net sale value after returns", currency(number(sale.total) - number(sale.returnedAmount)), "grand"]);
  }
  return rows;
}

function drawA4Header(doc, sale, business, continuation = false) {
  const left = 40;
  const right = 555;
  let textX = left;
  const logo = imageBuffer(business.logo);
  if (logo) {
    try {
      doc.image(logo, left, 36, { fit: [52, 52] });
      textX += 62;
    } catch {
      textX = left;
    }
  }

  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(18)
    .text(printable(business.name, "Bizzrow"), textX, 37, { width: 285 });
  const contacts = [
    business.address,
    [business.phone && `Phone: ${business.phone}`, business.email].filter(Boolean).join(" | "),
    business.gstNumber && `GSTIN: ${business.gstNumber}`,
    business.upiId && `UPI: ${business.upiId}`,
  ].filter(Boolean).map((line) => printable(line));
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  let contactY = 62;
  for (const line of contacts) {
    const height = doc.heightOfString(line, { width: 285, fontSize: 8, lineGap: 1 });
    doc.text(line, textX, contactY, { width: 285, fontSize: 8, lineGap: 1 });
    contactY += height + 2;
  }

  doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(21)
    .text(continuation ? "INVOICE (CONT.)" : "INVOICE", 365, 37, { width: 190, align: "right" });
  doc.fillColor(COLORS.ink).fontSize(9).font("Helvetica-Bold")
    .text(`Invoice: ${printable(sale.invoiceNumber, "Not assigned")}`, 365, 67, { width: 190, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
    .text(`Date: ${dateLabel(sale.createdAt)}`, 365, 82, { width: 190, align: "right" });
  if (sale.dueDate) doc.text(`Due date: ${dateLabel(sale.dueDate)}`, 365, 95, { width: 190, align: "right" });
  if (sale.saleType) doc.text(`${printable(sale.saleType).toUpperCase()} SALE`, 365, 108, { width: 190, align: "right" });
  const headerBottom = Math.max(contactY + 2, 128);
  doc.moveTo(left, headerBottom).lineTo(right, headerBottom).strokeColor(COLORS.line).lineWidth(1).stroke();
  return headerBottom + 13;
}

function drawA4Customer(doc, sale, customer, y) {
  const left = 40;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text("BILL TO", left, y);
  const name = printable(customer.name || sale.customerName, "Walk-in Customer");
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink).text(name, left, y + 13, { width: 300 });
  let infoY = y + 29;
  const details = [
    customer.phone,
    customer.shopName,
    customer.address,
    customer.gstNumber || customer.gstin,
    sale.customerType === "walkin" ? "Walk-in sale" : "",
  ].filter(Boolean).map((line) => printable(line));
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  for (const detail of details) {
    const height = doc.heightOfString(detail, { width: 300, fontSize: 8, lineGap: 1 });
    doc.text(detail, left, infoY, { width: 300, fontSize: 8, lineGap: 1 });
    infoY += height + 1;
  }
  return Math.max(infoY, y + 36) + 10;
}

const A4_COLUMNS = [
  { key: "serial", title: "#", x: 40, width: 20, align: "left" },
  { key: "item", title: "ITEM / PRODUCT CODE", x: 62, width: 174, align: "left" },
  { key: "qty", title: "QTY", x: 237, width: 34, align: "right" },
  { key: "unit", title: "UNIT", x: 272, width: 30, align: "right" },
  { key: "rate", title: "RATE", x: 303, width: 57, align: "right" },
  { key: "discount", title: "DISC.", x: 361, width: 55, align: "right" },
  { key: "tax", title: "TAX", x: 417, width: 48, align: "right" },
  { key: "amount", title: "LINE TOTAL", x: 466, width: 89, align: "right" },
];

function drawA4TableHeader(doc, y) {
  doc.save().rect(40, y - 3, 515, 20).fill(COLORS.pale).restore();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.ink);
  for (const column of A4_COLUMNS) {
    doc.text(column.title, column.x, y + 3, { width: column.width, align: column.align, lineBreak: false });
  }
  return y + 24;
}

function drawA4Footer(doc, pageNumber, pageCount, business) {
  const bottom = doc.page.height - 32;
  doc.moveTo(40, bottom - 8).lineTo(555, bottom - 8).strokeColor(COLORS.line).lineWidth(0.7).stroke();
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted)
    .text(printable(business.phone ? `Contact: ${business.phone}` : "Thank you for your business."), 40, bottom, {
      width: 390,
      lineBreak: false,
    });
  doc.text(`Page ${pageNumber} of ${pageCount}`, 450, bottom, { width: 105, align: "right", lineBreak: false });
}

function buildA4(sale, business, customer) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      let y = drawA4Header(doc, sale, business);
      y = drawA4Customer(doc, sale, customer, y);
      y += 3;
      y = drawA4TableHeader(doc, y);

      const pageBottom = doc.page.height - 48;
      const addContinuationPage = () => {
        doc.addPage({ size: "A4", margin: 0 });
        let nextY = drawA4Header(doc, sale, business, true);
        nextY = drawA4TableHeader(doc, nextY + 2);
        return nextY;
      };

      (sale.items || []).forEach((item, index) => {
        const itemLines = [
          printable(item.name, "Item"),
          [item.sku && `SKU: ${item.sku}`, item.color, item.size].filter(Boolean).map(printable).join(" | "),
        ].filter(Boolean);
        doc.font("Helvetica").fontSize(8);
        const itemHeight = itemLines.reduce((height, line, lineIndex) =>
          height + doc.heightOfString(line, { width: A4_COLUMNS[1].width, fontSize: lineIndex ? 7 : 8, lineGap: 1 }), 0);
        const rowHeight = Math.max(19, itemHeight + 8);
        if (y + rowHeight > pageBottom) y = addContinuationPage();

        doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
          .text(String(index + 1), A4_COLUMNS[0].x, y + 3, { width: A4_COLUMNS[0].width, lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.ink)
          .text(itemLines[0], A4_COLUMNS[1].x, y + 2, { width: A4_COLUMNS[1].width, fontSize: 8, lineGap: 1 });
        if (itemLines[1]) {
          doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted)
            .text(itemLines[1], A4_COLUMNS[1].x, y + 3 + doc.heightOfString(itemLines[0], { width: A4_COLUMNS[1].width, fontSize: 8 }), {
              width: A4_COLUMNS[1].width,
              fontSize: 7,
              lineGap: 1,
            });
        }
        const values = {
          qty: printable(item.quantity),
          unit: printable(item.unit || ""),
          rate: currency(item.unitPrice),
          discount: number(item.discountAmount) ? currency(item.discountAmount) : "-",
          tax: number(item.taxAmount) ? currency(item.taxAmount) : "-",
          amount: currency(item.subtotal ?? number(item.unitPrice) * number(item.quantity)),
        };
        for (const column of A4_COLUMNS.slice(2)) {
          doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.ink)
            .text(values[column.key], column.x, y + 4, {
              width: column.width,
              align: column.align,
              lineBreak: false,
              ellipsis: true,
            });
        }
        y += rowHeight;
        doc.moveTo(40, y).lineTo(555, y).strokeColor(COLORS.line).lineWidth(0.45).stroke();
        y += 3;
      });

      if (!taxLines(sale).length) {
        if (y + 18 > pageBottom) y = addContinuationPage();
        doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted)
          .text("Tax was not itemized in the saved sale.", 40, y, { width: 515 });
        y += 12;
      }

      const rows = invoiceRows(sale);
      const totalsHeight = rows.length * 17 + 23;
      if (y + totalsHeight > pageBottom) y = addContinuationPage();
      y += 8;
      doc.moveTo(330, y).lineTo(555, y).strokeColor(COLORS.line).lineWidth(0.8).stroke();
      y += 10;
      for (const [label, value, kind] of rows) {
        const bold = kind === "grand" || kind === "due";
        const color = kind === "due" ? (number(sale.dueAmount) > 0 ? COLORS.red : COLORS.green)
          : kind === "credit" ? COLORS.green : COLORS.ink;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 9 : 8).fillColor(color);
        doc.text(printable(label), 330, y, { width: 130, fontSize: bold ? 9 : 8 });
        doc.text(printable(value), 460, y, { width: 95, align: "right", lineBreak: false });
        y += bold ? 18 : 15;
      }

      const terms = termsForSale(sale);
      if (terms.length) {
        y += 10;
        if (y + 35 > pageBottom) y = addContinuationPage();
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.ink).text("TERMS AND CONDITIONS", 40, y);
        y += 13;
        for (const [index, term] of terms.entries()) {
          const text = `${index + 1}. ${printable(term)}`;
          doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted);
          const height = doc.heightOfString(text, { width: 515, fontSize: 7.5, lineGap: 1 });
          if (y + height > pageBottom) {
            y = addContinuationPage();
            doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.ink).text("TERMS AND CONDITIONS (CONT.)", 40, y);
            y += 13;
          }
          doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted)
            .text(text, 40, y, { width: 515, fontSize: 7.5, lineGap: 1 });
          y += height + 4;
        }
      }

      y += 14;
      if (y + 50 > pageBottom) y = addContinuationPage() + 5;
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
        .text("Thank you for your business.", 40, y, { width: 260 });
      doc.moveTo(410, y + 21).lineTo(555, y + 21).strokeColor(COLORS.muted).lineWidth(0.6).stroke();
      doc.font("Helvetica").fontSize(7).text("Authorized signature", 410, y + 25, { width: 145, align: "center" });

      const pages = doc.bufferedPageRange();
      for (let index = 0; index < pages.count; index += 1) {
        doc.switchToPage(pages.start + index);
        drawA4Footer(doc, index + 1, pages.count, business);
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function estimateThermalHeight(sale, business, customer, width) {
  const textWidth = width - 28;
  const charsPerLine = Math.max(19, Math.floor(textWidth / (width < 180 ? 3.1 : 3.5)));
  const wrapLines = (value) => Math.max(1, Math.ceil(printable(value).length / charsPerLine));
  let height = 166 + wrapLines(business.name || "Bizzrow") * 12;
  for (const value of [business.address, business.phone, business.email, business.gstNumber, customer.name || sale.customerName]) {
    if (value) height += wrapLines(value) * 9;
  }
  for (const item of sale.items || []) {
    height += wrapLines(item.name) * 10 + 26;
    for (const value of [item.sku, item.color, item.size]) if (value) height += wrapLines(value) * 8;
    if (number(item.discountAmount)) height += 9;
  }
  height += invoiceRows(sale).length * 13 + 36;
  for (const term of termsForSale(sale)) height += wrapLines(term) * 8 + 4;
  return Math.max(360, Math.ceil(height + 35));
}

function thermalRowHeight(doc, label, value, contentWidth, size, bold) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
  const labelHeight = doc.heightOfString(printable(label), { width: contentWidth * 0.62 });
  const valueHeight = doc.heightOfString(printable(value), { width: contentWidth * 0.38, align: "right" });
  return Math.max(12, labelHeight + 2, valueHeight + 2);
}

function buildThermal(sale, business, customer, width) {
  return new Promise((resolve, reject) => {
    try {
      const margin = width < 180 ? 9 : 13;
      const contentWidth = width - margin * 2;
      const fontSize = width < 180 ? 7 : 8;
      const smallFontSize = width < 180 ? 6.5 : 7;
      const baseHeight = estimateThermalHeight(sale, business, customer, width);
      const measureDoc = new PDFDocument({ size: [width, baseHeight], margin: 0 });
      measureDoc.on("data", () => {});
      let extraHeight = 0;
      for (const item of sale.items || []) {
        const label = `${item.quantity} ${item.unit || ""} x ${currency(item.unitPrice)}`;
        const value = currency(item.subtotal ?? number(item.unitPrice) * number(item.quantity));
        extraHeight += Math.max(0, thermalRowHeight(measureDoc, label, value, contentWidth, fontSize, false) - 12);
        if (number(item.discountAmount)) {
          extraHeight += Math.max(0, thermalRowHeight(measureDoc, "  Line discount",
            `- ${currency(item.discountAmount)}`, contentWidth, smallFontSize, false) - 9);
        }
      }
      for (const [label, value, kind] of invoiceRows(sale)) {
        const emphasized = kind === "grand" || kind === "due";
        const size = emphasized ? fontSize + 0.5 : fontSize;
        extraHeight += Math.max(0, thermalRowHeight(measureDoc, label, value, contentWidth, size, emphasized) - 13);
      }
      measureDoc.end();
      const height = Math.ceil(baseHeight + extraHeight);
      const doc = new PDFDocument({ size: [width, height], margin: 0 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      let y = margin + 5;
      const separator = () => {
        doc.moveTo(margin, y).lineTo(width - margin, y).strokeColor(COLORS.line).lineWidth(0.6).stroke();
        y += 7;
      };
      const centered = (text, size = fontSize, bold = false) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(COLORS.ink)
          .text(printable(text), margin, y, { width: contentWidth, align: "center" });
        y = doc.y + 2;
      };
      const left = (text, size = fontSize, bold = false) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(COLORS.ink)
          .text(printable(text), margin, y, { width: contentWidth });
        y = doc.y + 2;
      };
      const rightRow = (label, value, size = fontSize, bold = false, color = COLORS.ink) => {
        const rowHeight = thermalRowHeight(doc, label, value, contentWidth, size, bold);
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color)
          .text(printable(label), margin, y, { width: contentWidth * 0.62 });
        doc.text(printable(value), margin + contentWidth * 0.62, y, {
          width: contentWidth * 0.38,
          align: "right",
        });
        y += rowHeight;
      };

      centered(business.name || "Bizzrow", width < 180 ? 10 : 12, true);
      for (const line of [business.address, business.phone, business.email, business.gstNumber && `GSTIN: ${business.gstNumber}`]) {
        if (line) centered(line, smallFontSize);
      }
      separator();
      centered("INVOICE", fontSize + 1, true);
      left(`Invoice: ${sale.invoiceNumber || "Not assigned"}`);
      left(`Date: ${dateLabel(sale.createdAt)}`);
      if (sale.dueDate) left(`Due: ${dateLabel(sale.dueDate)}`);
      left(`${printable(sale.saleType || "sale").toUpperCase()} | ${printable(customer.name || sale.customerName || "Walk-in Customer")}`);
      for (const line of [customer.phone, customer.shopName, customer.address]) if (line) left(line, smallFontSize);
      separator();

      for (const [index, item] of (sale.items || []).entries()) {
        left(`${index + 1}. ${printable(item.name, "Item")}`, fontSize, true);
        const detail = [item.sku && `SKU ${item.sku}`, item.color, item.size].filter(Boolean).map(printable).join(" | ");
        if (detail) left(detail, smallFontSize);
        const unit = item.unit || "";
        rightRow(`${item.quantity} ${unit} x ${currency(item.unitPrice)}`, currency(item.subtotal ?? number(item.unitPrice) * number(item.quantity)), fontSize);
        if (number(item.discountAmount)) rightRow("  Line discount", `- ${currency(item.discountAmount)}`, smallFontSize, false, COLORS.green);
      }
      separator();
      if (!taxLines(sale).length) left("Tax was not itemized in the saved sale.", smallFontSize);

      for (const [label, value, kind] of invoiceRows(sale)) {
        rightRow(label, value, kind === "grand" || kind === "due" ? fontSize + 0.5 : fontSize,
          kind === "grand" || kind === "due",
          kind === "due" ? (number(sale.dueAmount) > 0 ? COLORS.red : COLORS.green)
            : kind === "credit" ? COLORS.green : COLORS.ink);
      }
      if (termsForSale(sale).length) {
        separator();
        left("TERMS", fontSize, true);
        for (const term of termsForSale(sale)) left(`- ${term}`, smallFontSize);
      }
      separator();
      centered("Thank you for your business", smallFontSize);
      if (business.phone) centered(`Contact: ${business.phone}`, smallFontSize);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function buildInvoicePdfDocument(sale, business = {}, customer = {}, { format = "a4" } = {}) {
  if (format === "a4") return buildA4(sale, business, customer);
  if (format === "thermal80") return buildThermal(sale, business, customer, 226.77);
  if (format === "thermal58") return buildThermal(sale, business, customer, 164.41);
  throw new Error("Unsupported invoice PDF format");
}

module.exports = { buildInvoicePdfDocument, invoiceRows };
