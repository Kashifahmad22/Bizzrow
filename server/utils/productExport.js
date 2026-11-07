const { retailPrice, wholesalePrice } = require("./productPricing");

const PRODUCT_EXPORT_COLUMNS = [
  ["name", "Product name"],
  ["sku", "SKU"],
  ["barcode", "Barcode"],
  ["category", "Category"],
  ["brand", "Brand"],
  ["size", "Size"],
  ["color", "Colour / variant"],
  ["costPrice", "Cost price"],
  ["wholesalePrice", "Wholesale selling price"],
  ["retailPrice", "Retail selling price"],
  ["totalStock", "Total available stock"],
  ["reservedStock", "Reserved stock"],
  ["availableStock", "Available stock"],
  ["stockStatus", "Stock status"],
  ["unit", "Unit"],
  ["supplier", "Supplier"],
  ["createdAt", "Created date"],
];

function csvCell(value) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  if (/^[\t\r =+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function productExportRow(product) {
  const stock = Number(product.stock) || 0;
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    brand: product.brand,
    size: product.size,
    color: product.color,
    costPrice: product.costPrice == null ? "" : Number(product.costPrice),
    wholesalePrice: wholesalePrice(product),
    retailPrice: retailPrice(product),
    totalStock: stock,
    reservedStock: "",
    availableStock: stock,
    stockStatus: stock === 0 ? "Out of stock" : stock <= 10 ? "Low stock" : "In stock",
    unit: product.unit,
    supplier: product.supplier || "",
    createdAt: product.createdAt instanceof Date
      ? product.createdAt.toISOString()
      : product.createdAt || "",
  };
}

function buildProductCsv(products) {
  const header = PRODUCT_EXPORT_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const rows = products.map((product) => {
    const row = productExportRow(product);
    return PRODUCT_EXPORT_COLUMNS.map(([field]) => csvCell(row[field])).join(",");
  });
  return [header, ...rows].join("\r\n");
}

function inventoryFilename(businessName, date = new Date()) {
  const business = String(businessName || "Bizzrow")
    .normalize("NFKD")
    .replace(/[^\w -]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .toLowerCase() || "bizzrow";
  const day = date.toISOString().slice(0, 10);
  return `${business}-inventory-${day}.csv`;
}

module.exports = {
  PRODUCT_EXPORT_COLUMNS,
  buildProductCsv,
  inventoryFilename,
  productExportRow,
};
