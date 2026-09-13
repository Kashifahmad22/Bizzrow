/**
 * AI service — real Google Gemini integration (Gemini 2.5 Flash).
 *
 * All AI calls funnel through here so the provider can be swapped in one file.
 * The prompt templates are tuned for Indian clothing wholesalers/retailers —
 * they emphasize SKU-level signals, festival timing, and customer credit
 * behavior rather than generic business advice.
 *
 * Uses the official Google Gen AI SDK: https://www.npmjs.com/package/@google/genai
 *   GEMINI_API_KEY  — your key from https://aistudio.google.com/apikey
 *   GEMINI_MODEL    — defaults to "gemini-2.5-flash"
 */

const { GoogleGenAI } = require("@google/genai");

let _client = null;
function client() {
  if (_client) return _client;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to server/.env to enable AI insights.");
  }
  _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _client;
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Robust text extraction across SDK minor versions (text is a getter; guard for fn form too).
function extractText(response) {
  const t = response?.text;
  return (typeof t === "function" ? t.call(response) : t) || "";
}

const SYSTEM_PROMPT = `You are Bizzrow Intelligence, an operational advisor for Indian clothing wholesalers and retailers (garments, ready-made apparel).

Your job is to read structured business data (sales, stock, customers, ledger) and produce SHORT, ACTIONABLE insights — not generic advice.

Tone: direct, practical, business-owner friendly. Mix English with light Indian retail vocabulary (e.g. "stock", "customer balance", "pending"). Never lecture. Never say "as an AI". Never recommend hiring consultants.

Constraints:
- Each insight must be ONE concise sentence (max ~20 words) plus optional one-line reasoning.
- Use real numbers from the data — quantities, ₹ amounts, customer names.
- Currency is INR (₹). Use ₹ symbol.
- If data is empty or insufficient, return ONE insight that says so honestly.
- Do NOT invent products, customers, or numbers not present in the data.
`;

function buildInsightPrompt({ sales, products, customers }) {
  return `Analyze the following snapshot and produce a JSON array of insights.

Each insight object must have:
- kind: one of "top_sellers" | "slow_movers" | "reorder_suggestion" | "customer_signal" | "low_stock_alert" | "daily_summary"
- title: short label (3-6 words)
- body: one concise sentence with real numbers
- severity: "info" | "good" | "warn" | "critical"

Return 4-7 insights total, weighted toward what is most actionable RIGHT NOW. Always include exactly one "daily_summary" that gives a one-line overall pulse.

DATA:
${JSON.stringify({ sales, products, customers }, null, 2)}

Respond with valid JSON only — no markdown, no commentary. Format:
{ "insights": [ { "kind": "...", "title": "...", "body": "...", "severity": "..." } ] }`;
}

function buildHealthNarrativePrompt({ overall, category, subScores, metrics }) {
  return `You are reviewing a clothing business's Business Health Score, already computed deterministically. Do NOT recompute or dispute the numbers — explain them like a sharp business advisor.

OVERALL SCORE: ${overall}/100 (${category?.label})
SUB-SCORES (0-100): ${JSON.stringify(subScores)}
KEY METRICS: ${JSON.stringify(metrics)}

Produce three short lists:
- strengths: 2-3 things going well (only if genuinely supported by the numbers)
- risks: 2-3 concrete risks or weak spots that need attention
- opportunities: 1-2 specific growth moves

Each item: ONE punchy sentence (max ~16 words), referencing a real number from the metrics where possible (₹ amounts, counts, %). Practical and specific to a garment/apparel shop. No generic filler, no "consult an expert".

Respond with valid JSON only:
{ "strengths": ["..."], "risks": ["..."], "opportunities": ["..."] }`;
}

function buildMarketingPrompt({ product, businessName }) {
  return `Write a short WhatsApp broadcast message announcing this new product from ${businessName || "our shop"}.

Product:
- Name: ${product.name}
- Category: ${product.category}
- Color: ${product.color || "—"}
- Size: ${product.size || "—"}
- Price: ₹${product.sellingPrice}
- Stock available: ${product.stock}

Rules:
- Max 3 short lines
- Use 1-2 relevant emojis (clothing/sparkle)
- Include the price prominently
- End with a soft CTA ("Reply to order" or similar)
- No hashtags, no spam phrasing

Return only the message text, nothing else.`;
}

async function generateInsights({ sales, products, customers }) {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildInsightPrompt({ sales, products, customers }),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  const text = extractText(response) || "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { insights: [] };
  }
  return Array.isArray(parsed.insights) ? parsed.insights : [];
}

async function generateHealthNarrative({ overall, category, subScores, metrics }) {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildHealthNarrativePrompt({ overall, category, subScores, metrics }),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.5,
      responseMimeType: "application/json",
    },
  });

  const text = extractText(response) || "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  return {
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
  };
}

async function generateMarketingCopy({ product, businessName }) {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildMarketingPrompt({ product, businessName }),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
    },
  });
  return extractText(response).trim();
}

/**
 * OCR + extraction for supplier purchase invoices (Master Sprint).
 * Uses Gemini vision via inlineData (image or PDF). Returns raw structured JSON;
 * the route normalizes it (utils/ocrNormalize) before the review workflow.
 * NEVER creates inventory — extraction only.
 */
async function extractInvoiceProducts({ base64, mimeType }) {
  const ai = client();
  const prompt = `You are an OCR and data-extraction engine for SUPPLIER PURCHASE INVOICES used by Indian retailers/wholesalers.
Read the attached invoice (image or PDF) and extract every PRODUCT line item.

Return STRICT JSON only (no markdown, no commentary):
{
  "supplier": "", "invoiceNumber": "", "invoiceDate": "", "gstin": "",
  "items": [
    { "name": "", "quantity": 0, "unit": "", "costPrice": 0, "discount": 0, "gstPct": 0, "cgst": 0, "sgst": 0, "igst": 0, "hsn": "", "taxableValue": 0, "finalAmount": 0 }
  ]
}

Rules:
- "costPrice" = per-unit purchase rate (labelled Rate / Unit Price / Purchase Rate / MRP).
- "quantity" = numeric only; put the unit (Nos / PCS / Box / Kg / Mtr…) in "unit".
- If tax is split, fill cgst/sgst/igst; "gstPct" = total tax percentage.
- Skip header rows, subtotal/total rows, and anything that is not a sellable product.
- If a field is unknown use 0 or "". Do NOT invent products or numbers.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
    config: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const text = extractText(response) || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { items: [] };
  }
}

module.exports = { generateInsights, generateMarketingCopy, generateHealthNarrative, extractInvoiceProducts };



//test line for github