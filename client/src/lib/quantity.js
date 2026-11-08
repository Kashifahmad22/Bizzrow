export function quantityParts(value) {
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) throw new Error("Invalid quantity");
  let scale = (match[3] || "").length - Number(match[4] || 0);
  let digits = BigInt(`${match[1]}${match[2]}${match[3] || ""}`);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}

function align(a, b) {
  const x = quantityParts(a);
  const y = quantityParts(b);
  const scale = Math.max(x.scale, y.scale);
  return [x.digits * 10n ** BigInt(scale - x.scale), y.digits * 10n ** BigInt(scale - y.scale), scale];
}

export function addQuantity(a, b) {
  const [x, y, scale] = align(a, b);
  return Number(`${x + y}e-${scale}`);
}

export function subtractQuantity(a, b) {
  const [x, y, scale] = align(a, b);
  return Number(`${x - y}e-${scale}`);
}

export function stepQuantity(current, stock, direction) {
  const parsed = quantityParts(stock);
  const units = parsed.scale > 3
    ? parsed.digits / (10n ** BigInt(parsed.scale - 3))
    : parsed.digits * (10n ** BigInt(3 - parsed.scale));
  const maximum = Number(units) / 1000;
  const candidate = direction > 0
    ? addQuantity(Number(current) || 0, 1)
    : subtractQuantity(Number(current) || 0, 1);
  return Math.min(maximum, Math.max(0.001, candidate));
}
