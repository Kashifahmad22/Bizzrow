/**
 * OCR normalization (Master Sprint — Unified Product Creation).
 *
 * Different supplier-invoice formats use different labels for the same thing.
 * These helpers standardize extracted fields so the review workflow always sees
 * a consistent shape, regardless of the source format.
 */

const UNIT_ALIASES = {
  nos: "pcs",
  no: "pcs",
  pcs: "pcs",
  pc: "pcs",
  pieces: "pcs",
  piece: "pcs",
  unit: "pcs",
  units: "pcs",
  qty: "pcs",
  box: "box",
  boxes: "box",
  ctn: "box",
  carton: "box",
  pkt: "pkt",
  packet: "pkt",
  pack: "pkt",
  kg: "kg",
  kgs: "kg",
  g: "g",
  gm: "g",
  gram: "g",
  grams: "g",
  ltr: "ltr",
  l: "ltr",
  litre: "ltr",
  liter: "ltr",
  mtr: "mtr",
  m: "mtr",
  meter: "mtr",
  metre: "mtr",
  dozen: "dozen",
  dz: "dozen",
};

function normalizeUnit(raw) {
  if (!raw) return "pcs";
  const key = String(raw).trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[key] || key || "pcs";
}

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  // strip currency symbols, commas, spaces
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalize one raw extracted line into the canonical draft shape.
 * Accepts a variety of field-name aliases coming from the model / different
 * invoice formats (Rate / Unit Price / Purchase Rate -> costPrice, etc.).
 */
// Normalize a key for fuzzy matching: lowercase + strip spaces/underscores/punctuation.
function normKey(k) {
  return String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeLine(raw = {}) {
  // Build a fuzzy-keyed map so "Unit Price", "unit_price", "UNITPRICE" all match.
  const map = {};
  for (const k of Object.keys(raw)) map[normKey(k)] = raw[k];
  const get = (...aliases) => {
    for (const a of aliases) {
      const v = map[normKey(a)];
      if (v != null && v !== "") return v;
    }
    return undefined;
  };

  const name = String(get("name", "productName", "product", "description", "item", "particulars") || "").trim();
  const quantity = toNumber(get("quantity", "qty", "nos", "pcs", "pieces"));
  const unit = normalizeUnit(get("unit", "uom", "units"));
  const costPrice = toNumber(get("costPrice", "rate", "unitPrice", "price", "purchaseRate", "mrp"));
  const discount = toNumber(get("discount", "disc"));
  const cgst = toNumber(get("cgst"));
  const sgst = toNumber(get("sgst"));
  const igst = toNumber(get("igst"));
  const gstPct = toNumber(get("gstPct", "gst", "taxRate", "tax")) || cgst + sgst + igst;
  const hsn = String(get("hsn", "hsnCode", "hsnSac") || "").trim();
  const taxableValue = toNumber(get("taxableValue", "taxable", "amount", "value"));
  const finalAmount = toNumber(get("finalAmount", "total", "netAmount", "lineTotal"));

  return {
    name,
    quantity: quantity || 1,
    unit,
    costPrice: costPrice || 0,
    discount,
    gstPct,
    cgst,
    sgst,
    igst,
    hsn,
    taxableValue,
    finalAmount,
  };
}

function normalizeExtraction(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    supplier: raw.supplier || raw.supplierName || "",
    invoiceNumber: raw.invoiceNumber || raw.invoiceNo || raw.invoice_number || "",
    invoiceDate: raw.invoiceDate || raw.date || "",
    gstin: raw.gstin || raw.GSTIN || raw.gst || "",
    items: items.map(normalizeLine).filter((it) => it.name),
  };
}

module.exports = { normalizeUnit, normalizeLine, normalizeExtraction, toNumber };
