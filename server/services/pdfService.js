/**
 * PDF invoice generator (pdfkit).
 *
 * buildInvoicePdf(sale, business, customer) -> Promise<Buffer>
 *
 * Note on currency: pdfkit's built-in Helvetica (WinAnsi) has no glyph for the
 * ₹ rupee sign, so the PDF uses an ASCII "Rs." prefix to guarantee clean
 * rendering without bundling a custom font. (WhatsApp/HTML still use ₹.)
 */

const PDFDocument = require("pdfkit");

const INK = "#161a2b";
const MUTED = "#7a8198";
const BRAND = "#3849f5";
const LINE = "#e6e8f0";

function rupee(n) {
  const v = Number(n || 0);
  return `Rs. ${v.toLocaleString("en-IN")}`;
}

function logoBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/(png|jpe?g));base64,(.+)$/i);
  if (!m) return null; // pdfkit only supports PNG/JPEG
  try {
    return Buffer.from(m[3], "base64");
  } catch {
    return null;
  }
}

function buildInvoicePdf(sale, business = {}, customer = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageLeft = 50;
      const pageRight = 545;
      const brandName = business.name || "Bizzrow";

      // ---- Header ----
      const logo = logoBuffer(business.logo);
      let headerTextX = pageLeft;
      if (logo) {
        try {
          doc.image(logo, pageLeft, 50, { fit: [56, 56] });
          headerTextX = pageLeft + 70;
        } catch {
          headerTextX = pageLeft;
        }
      }
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(brandName, headerTextX, 54);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED);
      const contactLines = [];
      if (business.address) contactLines.push(business.address);
      const line2 = [business.phone ? `Phone: ${business.phone}` : null, business.gstNumber ? `GST: ${business.gstNumber}` : null]
        .filter(Boolean)
        .join("   ");
      if (line2) contactLines.push(line2);
      if (business.upiId) contactLines.push(`UPI: ${business.upiId}`);
      doc.text(contactLines.join("\n"), headerTextX, 78, { width: 300 });

      // Invoice label (right aligned)
      doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(22).text("INVOICE", pageRight - 160, 54, { width: 160, align: "right" });
      doc.fillColor(MUTED).font("Helvetica").fontSize(9);
      doc.text(`Invoice #: ${sale.invoiceNumber}`, pageRight - 200, 84, { width: 200, align: "right" });
      doc.text(`Date: ${new Date(sale.createdAt || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, pageRight - 200, 98, { width: 200, align: "right" });

      // Divider
      doc.moveTo(pageLeft, 124).lineTo(pageRight, 124).strokeColor(LINE).lineWidth(1).stroke();

      // ---- Bill to ----
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("BILL TO", pageLeft, 140);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(sale.customerName || "Walk-in Customer", pageLeft, 154);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED);
      if (customer && customer.phone) doc.text(customer.phone, pageLeft, 172);
      if (customer && customer.shopName) doc.text(customer.shopName, pageLeft, 185);
      if (sale.customerType === "walkin") doc.text("Walk-in (no ledger account)", pageLeft, customer && customer.phone ? 185 : 172);

      // ---- Items table ----
      let y = 220;
      const cols = { item: pageLeft, qty: 330, rate: 400, amount: 470 };
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(9);
      doc.text("ITEM", cols.item, y);
      doc.text("QTY", cols.qty, y, { width: 50, align: "right" });
      doc.text("RATE", cols.rate, y, { width: 60, align: "right" });
      doc.text("AMOUNT", cols.amount, y, { width: 75, align: "right" });
      y += 16;
      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor(LINE).lineWidth(1).stroke();
      y += 8;

      doc.font("Helvetica").fontSize(10);
      (sale.items || []).forEach((it) => {
        const meta = [it.color, it.size].filter(Boolean).join(" · ");
        const discLabel =
          it.discountAmount > 0
            ? `Disc ${it.discountType === "percent" ? `${it.discountValue}%` : rupee(it.discountValue)} (−${rupee(it.discountAmount)})`
            : "";
        const note = [meta, discLabel].filter(Boolean).join("   ·   ");
        doc.fillColor(INK).fontSize(10).text(it.name, cols.item, y, { width: 270 });
        const nameHeight = doc.heightOfString(it.name, { width: 270 });
        if (note) {
          doc.fillColor(MUTED).fontSize(8).text(note, cols.item, y + nameHeight, { width: 270 });
          doc.fontSize(10);
        }
        doc.fillColor(INK);
        doc.text(String(it.quantity), cols.qty, y, { width: 50, align: "right" });
        doc.text(rupee(it.unitPrice), cols.rate, y, { width: 60, align: "right" });
        doc.text(rupee(it.subtotal), cols.amount, y, { width: 75, align: "right" });
        y += Math.max(nameHeight, 14) + (note ? 12 : 6) + 6;
      });

      // ---- Totals ----
      y += 6;
      doc.moveTo(320, y).lineTo(pageRight, y).strokeColor(LINE).lineWidth(1).stroke();
      y += 10;
      const totalRow = (label, value, opts = {}) => {
        doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.bold ? 12 : 10);
        doc.fillColor(opts.color || INK);
        doc.text(label, 320, y, { width: 120 });
        doc.text(value, cols.amount, y, { width: 75, align: "right" });
        y += opts.bold ? 20 : 16;
      };
      if ((sale.totalDiscount || 0) > 0) {
        totalRow("Subtotal", rupee(sale.subtotal || sale.total));
        totalRow("Discount", `- ${rupee(sale.totalDiscount)}`, { color: "#0f9d58" });
      }
      totalRow("Total", rupee(sale.total), { bold: true });

      // Payment breakdown
      if (Array.isArray(sale.payments) && sale.payments.length > 0) {
        const labelMap = { cash: "Cash", upi: "UPI", bank: "Bank", card: "Card", credit: "Credit" };
        sale.payments.forEach((p) => totalRow(labelMap[p.method] || p.method, rupee(p.amount)));
      }
      totalRow("Paid", rupee(sale.amountPaid), { color: "#0f9d58" });
      totalRow("Due", rupee(sale.dueAmount), { bold: true, color: sale.dueAmount > 0 ? "#d93025" : "#0f9d58" });

      // ---- Footer ----
      const footerY = 770;
      doc.moveTo(pageLeft, footerY).lineTo(pageRight, footerY).strokeColor(LINE).lineWidth(1).stroke();
      doc.fillColor(MUTED).font("Helvetica").fontSize(8);
      doc.text("Thank you for your business.", pageLeft, footerY + 8);
      doc.fillColor(BRAND).font("Helvetica-Bold").text("Generated by Bizzrow", pageLeft, footerY + 8, { width: pageRight - pageLeft, align: "right" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * buildLedgerStatementPdf(customer, business, statement) -> Promise<Buffer>
 * statement = { openingBalance, closingBalance, entries:[{date,type,note,amount,balance}], from, to }
 */
function buildLedgerStatementPdf(customer = {}, business = {}, statement = {}) {
  return new Promise((resolve, reject) => {
    try {
      const MARGIN = 50;
      const doc = new PDFDocument({ size: "A4", margin: MARGIN });
      const PAGE_W = doc.page.width; // 595.28
      const PAGE_H = doc.page.height; // 841.89
      const pageLeft = MARGIN;
      const pageRight = PAGE_W - MARGIN;
      const FOOTER_RESERVE = 46; // never let content enter this bottom band
      const contentBottom = PAGE_H - MARGIN - FOOTER_RESERVE;

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const brandName = business.name || "Bizzrow";
      const cols = { date: pageLeft, part: 130, debit: 330, credit: 410, bal: 480 };
      const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

      // Footer sits inside the reserved band so it can never spill to a new page.
      function drawFooter() {
        const fy = PAGE_H - MARGIN - 22;
        doc.moveTo(pageLeft, fy - 8).lineTo(pageRight, fy - 8).strokeColor(LINE).lineWidth(1).stroke();
        doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("This is a system-generated statement.", pageLeft, fy, { lineBreak: false });
        doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(8).text("Generated by Bizzrow", pageLeft, fy, { width: pageRight - pageLeft, align: "right", lineBreak: false });
      }

      function drawTableHeader(yStart) {
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(9);
        doc.text("DATE", cols.date, yStart, { lineBreak: false });
        doc.text("PARTICULARS", cols.part, yStart, { lineBreak: false });
        doc.text("DEBIT", cols.debit, yStart, { width: 70, align: "right", lineBreak: false });
        doc.text("CREDIT", cols.credit, yStart, { width: 60, align: "right", lineBreak: false });
        doc.text("BALANCE", cols.bal, yStart, { width: 65, align: "right", lineBreak: false });
        const ny = yStart + 15;
        doc.moveTo(pageLeft, ny).lineTo(pageRight, ny).strokeColor(LINE).lineWidth(1).stroke();
        return ny + 8;
      }

      // ---- First-page header ----
      const logo = logoBuffer(business.logo);
      let hx = pageLeft;
      if (logo) {
        try {
          doc.image(logo, pageLeft, 50, { fit: [48, 48] });
          hx = pageLeft + 62;
        } catch {
          hx = pageLeft;
        }
      }
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(18).text(brandName, hx, 54, { lineBreak: false });
      const contact = [business.phone ? `Phone: ${business.phone}` : null, business.gstNumber ? `GST: ${business.gstNumber}` : null]
        .filter(Boolean)
        .join("   ");
      if (contact) doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(contact, hx, 76, { lineBreak: false });
      doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("LEDGER STATEMENT", pageRight - 220, 54, { width: 220, align: "right", lineBreak: false });
      const period = statement.from || statement.to ? `${fmt(statement.from) || "Beginning"} - ${fmt(statement.to) || "Today"}` : "All time";
      doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(`Period: ${period}`, pageRight - 220, 78, { width: 220, align: "right", lineBreak: false });
      doc.moveTo(pageLeft, 108).lineTo(pageRight, 108).strokeColor(LINE).lineWidth(1).stroke();

      // Customer block — wraps long names / addresses instead of overlapping.
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("CUSTOMER", pageLeft, 122, { lineBreak: false });
      let cy = 134;
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(customer.name || "—", pageLeft, cy, { width: 320 });
      cy += Math.max(doc.heightOfString(customer.name || "—", { width: 320 }), 14);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED);
      if (customer.phone) {
        doc.text(customer.phone, pageLeft, cy, { width: 320 });
        cy += 12;
      }
      if (customer.shopName) {
        doc.text(customer.shopName, pageLeft, cy, { width: 320 });
        cy += Math.max(doc.heightOfString(customer.shopName, { width: 320 }), 12);
      }

      let y = Math.max(cy + 14, 192);
      y = drawTableHeader(y);

      // Opening balance
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text("Opening balance", cols.part, y, { lineBreak: false });
      doc.fillColor(INK).font("Helvetica").text(rupee(statement.openingBalance), cols.bal, y, { width: 65, align: "right", lineBreak: false });
      y += 18;

      // Rows with dynamic page breaks
      doc.font("Helvetica").fontSize(9);
      (statement.entries || []).forEach((e) => {
        const label = e.note || e.type || "";
        const rowH = Math.max(doc.heightOfString(label, { width: 190 }), 11) + 6;
        if (y + rowH > contentBottom) {
          drawFooter();
          doc.addPage();
          y = MARGIN + 6;
          doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(`${brandName} — Ledger statement (continued)`, pageLeft, y, { lineBreak: false });
          y += 22;
          y = drawTableHeader(y);
          doc.font("Helvetica").fontSize(9);
        }
        const isDebit = e.amount >= 0; // sales increase what the customer owes
        doc.fillColor(MUTED).text(new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), cols.date, y, { width: 75, lineBreak: false });
        doc.fillColor(INK).text(label, cols.part, y, { width: 190 });
        doc.text(isDebit ? rupee(e.amount) : "", cols.debit, y, { width: 70, align: "right", lineBreak: false });
        doc.text(!isDebit ? rupee(-e.amount) : "", cols.credit, y, { width: 60, align: "right", lineBreak: false });
        doc.text(rupee(e.balance), cols.bal, y, { width: 65, align: "right", lineBreak: false });
        y += rowH;
      });

      // Closing balance — keep it on the same page as the footer band.
      if (y + 30 > contentBottom) {
        drawFooter();
        doc.addPage();
        y = MARGIN + 6;
        y = drawTableHeader(y);
      }
      y += 4;
      doc.moveTo(300, y).lineTo(pageRight, y).strokeColor(LINE).lineWidth(1).stroke();
      y += 8;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Closing balance", 300, y, { width: 120, lineBreak: false });
      doc.text(rupee(statement.closingBalance), cols.bal, y, { width: 65, align: "right", lineBreak: false });

      // Footer on the final page.
      drawFooter();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildInvoicePdf, buildLedgerStatementPdf };
