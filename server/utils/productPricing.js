const { paymentPaise } = require("./saleMath");

function validateCurrency(value, field) {
  try {
    return paymentPaise(value) / 100;
  } catch {
    throw Object.assign(new Error(`${field} must be a non-negative number with at most two decimal places`), { status: 400 });
  }
}

function wholesalePrice(product) {
  const explicit = Number(product.wholesalePrice);
  if (product.wholesalePrice != null && Number.isFinite(explicit)) return explicit;
  return Number(product.sellingPrice) || 0;
}

// Official default: retail = 2x the GST-inclusive wholesale price.
function defaultRetailPrice(wholesale) {
  const retail = Math.round((Number(wholesale) || 0) * 200) / 100;
  if (!Number.isSafeInteger(Math.round(retail * 100))) {
    throw Object.assign(new Error("retailPrice is outside the safe currency range"), { status: 400 });
  }
  return retail;
}

function retailPrice(product) {
  if (product.retailPrice != null) {
    const explicit = Number(product.retailPrice);
    if (Number.isFinite(explicit)) return explicit;
  }
  return defaultRetailPrice(wholesalePrice(product));
}

// Manual-override state. Legacy documents (flag null/undefined) resolve with a
// conservative heuristic: any retail price that differs from the 2x default is
// treated as manually configured so it is never silently overwritten.
function isRetailOverridden(product) {
  if (typeof product.retailPriceOverridden === "boolean") return product.retailPriceOverridden;
  if (product.retailPrice == null) return false;
  return retailPrice(product) !== defaultRetailPrice(wholesalePrice(product));
}

// Selling prices are GST-inclusive. Extract the GST component at the product's
// configured rate: GST = inclusive x rate / (100 + rate). Display-only — sale
// records and invoices never add GST on top of the inclusive price.
function gstBreakdown(inclusiveAmount, gstPct) {
  const amount = Number(inclusiveAmount);
  const rate = Number(gstPct);
  const rounded = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
  if (!rounded || !Number.isFinite(rate) || rate <= 0) {
    return { gstPct: 0, gstAmount: 0, taxableValue: rounded };
  }
  const gstAmount = Math.round(((rounded * rate) / (100 + rate)) * 100) / 100;
  return {
    gstPct: rate,
    gstAmount,
    taxableValue: Math.round((rounded - gstAmount) * 100) / 100,
  };
}

function salePrice(product, saleType = "wholesale") {
  if (saleType !== "wholesale" && saleType !== "retail") {
    const error = new Error("Sale type must be wholesale or retail");
    error.status = 400;
    throw error;
  }
  return saleType === "retail" ? retailPrice(product) : wholesalePrice(product);
}

function initialSalePrice(product, saleType, item, body) {
  const authoritative = body.saleType || ["expectedTotal", "reviewedItems", "cashTendered"]
    .some((field) => Object.prototype.hasOwnProperty.call(body, field));
  return authoritative ? salePrice(product, saleType) : Number(item.unitPrice ?? wholesalePrice(product));
}

function serializeProduct(product) {
  const result = typeof product.toObject === "function" ? product.toObject() : { ...product };
  result.retailPriceOverridden = isRetailOverridden(result);
  result.wholesalePrice = wholesalePrice(result);
  result.retailPrice = retailPrice(result);
  result.sellingPrice = result.wholesalePrice;
  return result;
}

function matchesStored(value, stored) {
  return stored != null && (typeof value === "number" || typeof value === "string")
    && value !== "" && Number(value) === Number(stored);
}

function normalizeProductPrices(body, { creating = false, current = null } = {}) {
  const wholesaleProvided = body.wholesalePrice !== undefined || body.sellingPrice !== undefined;
  const retailProvided = body.retailPrice !== undefined;
  const values = {};

  if (wholesaleProvided) {
    const raw = body.wholesalePrice ?? body.sellingPrice;
    const stored = current ? wholesalePrice(current) : null;
    const wholesale = matchesStored(raw, stored) ? Number(stored) : validateCurrency(raw, "wholesalePrice");
    values.wholesalePrice = wholesale;
    values.sellingPrice = wholesale;
  }
  if (retailProvided) {
    const stored = current ? retailPrice(current) : null;
    values.retailPrice = matchesStored(body.retailPrice, stored)
      ? Number(stored)
      : validateCurrency(body.retailPrice, "retailPrice");
  }

  const effectiveWholesale = values.wholesalePrice ?? (current ? wholesalePrice(current) : null);

  if (retailProvided) {
    if (effectiveWholesale != null) {
      values.retailPriceOverridden = values.retailPrice !== defaultRetailPrice(effectiveWholesale);
    }
  } else if (creating) {
    if (values.wholesalePrice != null) {
      values.retailPrice = defaultRetailPrice(values.wholesalePrice);
      values.retailPriceOverridden = false;
    }
  } else if (current && wholesaleProvided
      && values.wholesalePrice !== wholesalePrice(current) && !isRetailOverridden(current)) {
    // Wholesale changed without an explicit retail price: keep the 2x default
    // in sync unless the retail price was manually configured.
    values.retailPrice = defaultRetailPrice(values.wholesalePrice);
    values.retailPriceOverridden = false;
  }
  return values;
}

module.exports = {
  wholesalePrice,
  retailPrice,
  defaultRetailPrice,
  isRetailOverridden,
  gstBreakdown,
  salePrice,
  initialSalePrice,
  serializeProduct,
  normalizeProductPrices,
  validateCurrency,
};
