function wholesalePrice(product) {
  const explicit = Number(product.wholesalePrice);
  if (product.wholesalePrice != null && Number.isFinite(explicit)) return explicit;
  return Number(product.sellingPrice) || 0;
}

function retailPrice(product) {
  if (product.retailPrice != null) {
    const explicit = Number(product.retailPrice);
    if (Number.isFinite(explicit)) return explicit;
  }
  return Math.round(wholesalePrice(product) * 200) / 100;
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
  result.wholesalePrice = wholesalePrice(result);
  result.retailPrice = retailPrice(result);
  result.sellingPrice = result.wholesalePrice;
  return result;
}

function normalizeProductPrices(body, { creating = false, current = null } = {}) {
  const wholesale = body.wholesalePrice ?? body.sellingPrice;
  const values = {
    ...(body.wholesalePrice !== undefined || body.sellingPrice !== undefined
      ? { wholesalePrice: wholesale, sellingPrice: wholesale }
      : {}),
    ...(body.retailPrice !== undefined ? { retailPrice: body.retailPrice } : {}),
  };
  for (const [field, value] of Object.entries(values)) {
    const stored = current && (field === "sellingPrice" || field === "wholesalePrice"
      ? wholesalePrice(current) : retailPrice(current));
    if (stored != null && (typeof value === "number" || typeof value === "string")
        && value !== "" && Number(value) === Number(stored)) {
      values[field] = Number(stored);
      continue;
    }
    values[field] = validateCurrency(value, field);
  }
  if (creating && values.retailPrice == null && values.wholesalePrice != null) {
    const retailPaise = paymentPaise(values.wholesalePrice) * 2;
    if (!Number.isSafeInteger(retailPaise)) {
      throw Object.assign(new Error("retailPrice is outside the safe currency range"), { status: 400 });
    }
    values.retailPrice = retailPaise / 100;
  }
  return values;
}

module.exports = { wholesalePrice, retailPrice, salePrice, initialSalePrice, serializeProduct, normalizeProductPrices, validateCurrency };
const { paymentPaise } = require("./saleMath");

function validateCurrency(value, field) {
  try {
    return paymentPaise(value) / 100;
  } catch {
    throw Object.assign(new Error(`${field} must be a non-negative number with at most two decimal places`), { status: 400 });
  }
}
