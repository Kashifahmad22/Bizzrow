export function normalizeDuplicateGroups(groups) {
  if (!Array.isArray(groups)) {
    throw new Error("Duplicate review returned an invalid response.");
  }
  return groups.map((group) => {
    if (!Array.isArray(group?.products) || group.products.length !== 2) {
      throw new Error("Duplicate review returned an invalid product pair.");
    }
    const products = group.products.map((product) => {
      const productId = [product?.productId, product?._id, product?.id]
        .find((value) => typeof value === "string" && value.trim());
      if (!productId) {
        throw new Error("Duplicate review is missing product IDs. Restart the backend so it returns persisted product IDs, then retry.");
      }
      return { ...product, productId: productId.trim() };
    });
    if (products[0].productId === products[1].productId) {
      throw new Error("Duplicate review returned the same product twice.");
    }
    return { ...group, products };
  });
}

export function duplicatePairKey(pair) {
  return JSON.stringify(pair.products.map((product) => product.productId).sort());
}
