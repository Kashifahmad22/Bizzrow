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

function serializeProduct(product) {
  const result = typeof product.toObject === "function" ? product.toObject() : { ...product };
  result.wholesalePrice = wholesalePrice(result);
  result.retailPrice = retailPrice(result);
  result.sellingPrice = result.wholesalePrice;
  return result;
}

function normalizeProductPrices(body, { creating = false } = {}) {
  const wholesale = body.wholesalePrice ?? body.sellingPrice;
  const values = {
    ...(body.wholesalePrice !== undefined || body.sellingPrice !== undefined
      ? { wholesalePrice: wholesale, sellingPrice: wholesale }
      : {}),
    ...(body.retailPrice !== undefined ? { retailPrice: body.retailPrice } : {}),
  };
  if (creating && values.retailPrice == null && values.wholesalePrice != null) {
    values.retailPrice = Math.round(Number(values.wholesalePrice) * 200) / 100;
  }
  for (const [field, value] of Object.entries(values)) {
    const number = Number(value);
    if (value == null || value === "" || !Number.isFinite(number) || number < 0) {
      const error = new Error(`${field} must be a non-negative number`);
      error.status = 400;
      throw error;
    }
    values[field] = number;
  }
  return values;
}

module.exports = { wholesalePrice, retailPrice, salePrice, serializeProduct, normalizeProductPrices };
