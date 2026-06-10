/**
 * WhatsApp service — REAL Meta WhatsApp Cloud API integration.
 *
 * Credentials are read from environment variables (never hardcode):
 *   WHATSAPP_ACCESS_TOKEN        — permanent / system-user access token
 *   WHATSAPP_PHONE_NUMBER_ID     — the sending number's phone_number_id
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — WABA id (kept for reference / template mgmt)
 *   WHATSAPP_API_VERSION         — optional, defaults to v21.0
 *
 * Every send is persisted to the WhatsAppLog collection with the real provider
 * messageId (on success) or a captured error (on failure). Sends NEVER throw —
 * callers like sale recording stay safe even if WhatsApp is unconfigured.
 *
 * Uses Node 18+ global fetch / FormData / Blob (no extra dependency required).
 */

const WhatsAppLog = require("../models/WhatsAppLog");

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function creds() {
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  };
}

function isConfigured() {
  const { token, phoneId } = creds();
  return Boolean(token && phoneId);
}

function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (String(phone).trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

// Meta expects digits only with country code (no '+').
function toApiNumber(phone) {
  return normalizePhone(phone).replace(/\D/g, "");
}

async function persistWhatsAppLog({ owner, to, type, body, mediaUrl, payload, status, messageId, error }) {
  return WhatsAppLog.create({
    owner,
    to: normalizePhone(to),
    type: type || "custom",
    body: body || "",
    mediaUrl: mediaUrl || "",
    payload,
    status: status || "sent",
    messageId: messageId || "",
    error: error || "",
  });
}

async function graphPost(path, payload) {
  const { token } = creds();
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `WhatsApp API error ${res.status}`);
  }
  return data;
}

/**
 * Build the final messages payload, send it, and log the result.
 * Returns a status object; NEVER throws.
 */
async function dispatch({ owner, to, type, logBody, mediaUrl, message }) {
  const payload = { messaging_product: "whatsapp", to: toApiNumber(to), ...message };

  if (!isConfigured()) {
    const error =
      "WhatsApp not configured — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server/.env";
    const log = await persistWhatsAppLog({ owner, to, type, body: logBody, mediaUrl, payload, status: "failed", error });
    return { status: "failed", error, logId: log._id };
  }

  try {
    const { phoneId } = creds();
    const data = await graphPost(`${phoneId}/messages`, payload);
    const messageId = data?.messages?.[0]?.id || "";
    const log = await persistWhatsAppLog({ owner, to, type, body: logBody, mediaUrl, payload, status: "sent", messageId });
    return { status: "sent", messageId, logId: log._id };
  } catch (err) {
    const log = await persistWhatsAppLog({ owner, to, type, body: logBody, mediaUrl, payload, status: "failed", error: err.message });
    return { status: "failed", error: err.message, logId: log._id };
  }
}

// ---- Low-level senders (signatures preserved) ----

async function sendText({ owner, to, body, type = "custom" }) {
  return dispatch({
    owner,
    to,
    type,
    logBody: body,
    message: { type: "text", text: { preview_url: true, body } },
  });
}

async function sendMedia({ owner, to, mediaUrl, caption, type = "custom" }) {
  return dispatch({
    owner,
    to,
    type,
    logBody: caption || "",
    mediaUrl,
    message: { type: "image", image: { link: mediaUrl, caption } },
  });
}

async function sendDocument({ owner, to, link, mediaId, filename = "document.pdf", caption, type = "invoice" }) {
  const document = mediaId ? { id: mediaId, filename, caption } : { link, filename, caption };
  return dispatch({
    owner,
    to,
    type,
    logBody: caption || `[document:${filename}]`,
    mediaUrl: link || "",
    message: { type: "document", document },
  });
}

async function sendTemplate({ owner, to, templateName, languageCode = "en_US", components = [], type = "custom" }) {
  return dispatch({
    owner,
    to,
    type,
    logBody: `[template:${templateName}]`,
    message: { type: "template", template: { name: templateName, language: { code: languageCode }, components } },
  });
}

/**
 * Upload a local file buffer to Meta's media endpoint; returns a media id.
 * Throws on failure (callers wrap in try/catch). Uses multipart/form-data.
 */
async function uploadMedia({ buffer, filename = "invoice.pdf", mimeType = "application/pdf" }) {
  if (!isConfigured()) throw new Error("WhatsApp not configured");
  const { token, phoneId } = creds();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const res = await fetch(`${GRAPH}/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }, // do NOT set Content-Type; fetch adds the boundary
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp media upload error ${res.status}`);
  return data.id;
}

// ---- High-level helpers (signatures preserved) ----

async function sendInvoice({ owner, customer, sale, businessName, upiQr, pdfBuffer }) {
  const brand = businessName || "Bizzrow";
  const methodLabel = { cash: "Cash", upi: "UPI", bank: "Bank", card: "Card", credit: "Credit" };
  const lines = [`🧾 *Invoice #${sale.invoiceNumber}*`, `Thank you for shopping with ${brand}.`, ""];
  if ((sale.totalDiscount || 0) > 0) {
    lines.push(`Subtotal: ₹${sale.subtotal ?? sale.total}`);
    lines.push(`Discount: -₹${sale.totalDiscount}`);
  }
  lines.push(`*Total: ₹${sale.total}*`);
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    sale.payments.forEach((p) => lines.push(`${methodLabel[p.method] || p.method}: ₹${p.amount}`));
  }
  lines.push(`Paid: ₹${sale.amountPaid}`);
  lines.push(sale.dueAmount > 0 ? `Due: ₹${sale.dueAmount}` : `Payment received in full. Thank you! 🙏`);
  lines.push("", "Your invoice has been generated.");
  const body = lines.join("\n");

  // 1) Send the branded text summary.
  const textRes = await sendText({ owner, to: customer.phone, body, type: "invoice" });

  // 2) Optionally upload + attach the generated PDF document.
  let docRes = null;
  if (pdfBuffer && isConfigured()) {
    try {
      const mediaId = await uploadMedia({ buffer: pdfBuffer, filename: `Invoice-${sale.invoiceNumber}.pdf` });
      docRes = await sendDocument({
        owner,
        to: customer.phone,
        mediaId,
        filename: `Invoice-${sale.invoiceNumber}.pdf`,
        caption: `Invoice #${sale.invoiceNumber} — ${brand}`,
        type: "invoice",
      });
    } catch (err) {
      docRes = { status: "failed", error: err.message };
      await persistWhatsAppLog({
        owner,
        to: customer.phone,
        type: "invoice",
        body: `[document:Invoice-${sale.invoiceNumber}.pdf]`,
        status: "failed",
        error: err.message,
      });
    }
  }

  return { status: textRes.status, messageId: textRes.messageId, text: textRes, document: docRes };
}

async function sendReminder({ owner, customer, amount, businessName, upiQr }) {
  const brand = businessName || "Bizzrow";
  const body =
    `Hello ${customer.name},\n\n` +
    `You currently have ₹${amount} pending with ${brand}.\n` +
    `Please complete payment at your convenience.` +
    (upiQr ? `\n\nUse our UPI QR to pay instantly.` : "") +
    `\n\nThank you.`;

  return sendText({ owner, to: customer.phone, body, type: "reminder" });
}

async function sendBroadcast({ owner, customers, body, mediaUrl }) {
  const results = [];
  for (const customer of customers) {
    // Support a {name} merge token in the broadcast body.
    const personalized = String(body).replace(/\{name\}/gi, customer.name || "there");
    const res = mediaUrl
      ? await sendMedia({ owner, to: customer.phone, mediaUrl, caption: personalized, type: "broadcast" })
      : await sendText({ owner, to: customer.phone, body: personalized, type: "broadcast" });
    results.push({ customer: customer._id, ...res });
  }
  const sent = results.filter((r) => r.status === "sent").length;
  return { count: results.length, sent, failed: results.length - sent, results };
}

module.exports = {
  sendText,
  sendMedia,
  sendDocument,
  sendTemplate,
  uploadMedia,
  sendInvoice,
  sendReminder,
  sendBroadcast,
  normalizePhone,
  isConfigured,
};
