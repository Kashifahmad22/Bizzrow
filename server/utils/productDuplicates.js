const DUPLICATE_FIELDS = [
  { field: "sku", label: "Same SKU", normalize: normalizeText },
  { field: "barcode", label: "Same barcode", normalize: normalizeText },
];

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function productSnapshot(product) {
  return {
    productId: String(product._id),
    name: product.name || "",
    sku: product.sku || "",
    barcode: product.barcode || "",
    category: product.category || "",
    brand: product.brand || "",
    size: product.size || "",
    color: product.color || "",
    stock: Number(product.stock) || 0,
    costPrice: product.costPrice == null ? null : Number(product.costPrice),
    wholesalePrice: Number(product.wholesalePrice ?? product.sellingPrice) || 0,
    retailPrice: Number(product.retailPrice ?? ((Number(product.wholesalePrice ?? product.sellingPrice) || 0) * 2)) || 0,
    unit: product.unit || "",
  };
}

function detectProductDuplicates(products) {
  const pairs = new Map();
  const addBucket = (items, label) => {
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        const [first, second] = [items[left], items[right]].sort((a, b) => String(a._id).localeCompare(String(b._id)));
        const key = `${first._id}:${second._id}`;
        if (!pairs.has(key)) pairs.set(key, { products: [productSnapshot(first), productSnapshot(second)], matchingFields: new Set() });
        pairs.get(key).matchingFields.add(label);
      }
    }
  };

  for (const { field, label, normalize } of DUPLICATE_FIELDS) {
    const buckets = new Map();
    for (const product of products) {
      const value = normalize(product[field]);
      if (!value) continue;
      if (!buckets.has(value)) buckets.set(value, []);
      buckets.get(value).push(product);
    }
    for (const bucket of buckets.values()) addBucket(bucket, label);
  }

  const variants = new Map();
  for (const product of products) {
    const name = normalizeText(product.name);
    if (!name) continue;
    const size = normalizeText(product.size);
    const color = normalizeText(product.color);
    const key = JSON.stringify([name, size, color]);
    if (!variants.has(key)) variants.set(key, []);
    variants.get(key).push(product);
  }
  for (const bucket of variants.values()) addBucket(bucket, "Same product name, size, and colour");

  return [...pairs.values()]
    .map((pair) => ({
      products: pair.products,
      matchingFields: [...pair.matchingFields].sort(),
    }))
    .sort((a, b) => {
      const nameOrder = a.products[0].name.localeCompare(b.products[0].name);
      return nameOrder || a.products[1].name.localeCompare(b.products[1].name);
    });
}

module.exports = { detectProductDuplicates, normalizeText, productSnapshot };
