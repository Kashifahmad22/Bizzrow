import { quantityParts } from "./quantity.js";

export function multiplyRounded(a, b, divisor = 1) {
  const left = quantityParts(a);
  const right = quantityParts(b);
  const denominator = 10n ** BigInt(left.scale + right.scale) * BigInt(divisor);
  const numerator = left.digits * right.digits * 100n;
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  const cents = sign * ((absolute * 2n + denominator) / (2n * denominator));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Currency amount is outside the safe range");
  }
  return Number(cents) / 100;
}

export function proportionalCents(totalCents, quantity, totalQuantity) {
  const a = quantityParts(quantity);
  const b = quantityParts(totalQuantity);
  const scale = Math.max(a.scale, b.scale);
  const amount = a.digits * 10n ** BigInt(scale - a.scale);
  const total = b.digits * 10n ** BigInt(scale - b.scale);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || amount < 0n || total <= 0n || amount > total) {
    throw new Error("Cannot allocate return value for invalid quantities");
  }
  return Number((BigInt(totalCents) * amount * 2n + total) / (2n * total));
}
