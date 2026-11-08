function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

function isValidProductId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ""));
}

async function deleteUnusedProduct({
  Product,
  Sale,
  ReturnRecord,
  StockBatch,
  StockAdjustment,
  ownerId,
  productId,
  session,
}) {
  const product = await Product.findOne({ _id: productId, owner: ownerId }).session(session);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { status: 404 });
  }
  if (Number(product.stock) !== 0) {
    throw conflict("Product cannot be deleted while stock remains. Sell or adjust the stock first.");
  }

  const sale = await Sale.findOne({
    owner: ownerId,
    "items.product": product._id,
  }).select("_id").session(session);
  if (sale) {
    throw conflict("Product cannot be deleted because it is referenced by a sale or replacement.");
  }

  const returnRecord = await ReturnRecord.findOne({
    owner: ownerId,
    "items.product": product._id,
  }).select("_id").session(session);
  if (returnRecord) {
    throw conflict("Product cannot be deleted because it is referenced by a return or replacement record.");
  }

  const batch = await StockBatch.findOne({
    owner: ownerId,
    product: product._id,
  }).select("_id").session(session);
  if (batch) {
    throw conflict("Product cannot be deleted because it has purchase batch history.");
  }

  const adjustment = await StockAdjustment.findOne({
    owner: ownerId,
    product: product._id,
  }).select("_id").session(session);
  if (adjustment) {
    throw conflict("Product cannot be deleted because it has stock adjustment history.");
  }

  const deletion = await Product.deleteOne(
    { _id: product._id, owner: ownerId, stock: 0 },
    { session }
  );
  if (deletion.deletedCount !== 1) {
    throw conflict("Product changed while deletion was being checked. Refresh and try again.");
  }
  return { id: String(product._id), name: product.name };
}

module.exports = { deleteUnusedProduct, isValidProductId };
