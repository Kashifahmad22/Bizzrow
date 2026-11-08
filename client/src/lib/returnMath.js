import { addQuantity, subtractQuantity } from "./quantity.js";
import { multiplyRounded, proportionalCents } from "./money.js";

export function estimateReturnRefund(items, saleTotal, requestedItems) {
  const weights = items.map((item) => item.subtotal != null
    ? Number(item.subtotal) || 0
    : multiplyRounded(Number(item.unitPrice) || 0, Number(item.quantity) || 0));
  const totalCents = Math.max(0, Math.round((Number(saleTotal) || 0) * 100));
  const weightCents = weights.map((weight) => Math.max(0, Math.round(weight * 100)));
  const weightTotal = weightCents.reduce((sum, value) => sum + value, 0);
  const exact = weightCents.map((value) => weightTotal ? (totalCents * value) / weightTotal : 0);
  const allocated = exact.map(Math.floor);
  let remainder = totalCents - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder && order.length; i += 1) allocated[order[i].index] += 1;

  const requestedByProduct = new Map();
  for (const request of requestedItems) {
    const id = String(request.productId);
    requestedByProduct.set(id, addQuantity(requestedByProduct.get(id) || 0, Number(request.quantity || 0)));
  }
  let refundCents = 0;
  for (const [id, requested] of requestedByProduct) {
    let remaining = requested;
    for (const [index, item] of items.entries()) {
      if (String(item.product) !== id || remaining <= 0) continue;
      const oldReturned = Number(item.returnedQty) || 0;
      const quantity = Math.min(Math.max(0, subtractQuantity(Number(item.quantity || 0), oldReturned)), remaining);
      if (!quantity) continue;
      refundCents += proportionalCents(allocated[index], addQuantity(oldReturned, quantity), item.quantity)
        - proportionalCents(allocated[index], oldReturned, item.quantity);
      remaining = subtractQuantity(remaining, quantity);
    }
  }
  return refundCents / 100;
}
