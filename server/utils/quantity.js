function parts(value) {
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))) {
    throw Object.assign(new Error("Invalid quantity"), { status: 400 });
  }
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) throw Object.assign(new Error("Invalid quantity"), { status: 400 });
  let scale = (match[3] || "").length - Number(match[4] || 0);
  if (scale > 324 || scale < -308 || String(value).length > 128) {
    throw Object.assign(new Error("Quantity is outside the supported numeric range"), { status: 400 });
  }
  const inputScale = Math.max(0, scale);
  let digits = BigInt(`${match[1]}${match[2]}${match[3] || ""}`);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  while (scale > 0 && digits % 10n === 0n) {
    digits /= 10n;
    scale -= 1;
  }
  return { digits, scale, inputScale };
}

function aligned(a, b) {
  const x = parts(a);
  const y = parts(b);
  const scale = Math.max(x.scale, y.scale);
  return [x.digits * 10n ** BigInt(scale - x.scale), y.digits * 10n ** BigInt(scale - y.scale), scale];
}

function toNumber(digits, scale) {
  const result = Number(`${digits}e-${scale}`);
  if (!Number.isFinite(result)) throw Object.assign(new Error("Quantity cannot be represented safely; reconcile inventory before proceeding"), { status: 409 });
  const [a, b] = aligned(result, `${digits}e-${scale}`);
  if (a !== b) throw Object.assign(new Error("Quantity cannot be represented safely; reconcile inventory before proceeding"), { status: 409 });
  return result;
}

function add(a, b) {
  const [x, y, scale] = aligned(a, b);
  return toNumber(x + y, scale);
}

function subtract(a, b) {
  const [x, y, scale] = aligned(a, b);
  return toNumber(x - y, scale);
}

function validateNewQuantity(value, { allowZero = false, signed = false } = {}) {
  const valueParts = parts(value);
  if (valueParts.inputScale > 3 || (!signed && valueParts.digits < 0n) || (!allowZero && valueParts.digits === 0n)) {
    throw Object.assign(new Error("Quantity must be valid and have at most three decimal places"), { status: 400 });
  }
  return toNumber(valueParts.digits, valueParts.scale);
}

function exactQuantity(value) {
  const { digits, scale } = parts(value);
  return toNumber(digits, scale);
}

function proportionalCents(totalCents, quantity, totalQuantity) {
  const [amount, total] = aligned(quantity, totalQuantity);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || amount < 0n || total <= 0n || amount > total) {
    throw Object.assign(new Error("Cannot allocate return value for invalid quantities"), { status: 409 });
  }
  const numerator = BigInt(totalCents) * amount;
  return Number((numerator * 2n + total) / (2n * total));
}

module.exports = { add, subtract, validateNewQuantity, exactQuantity, parts, proportionalCents };
