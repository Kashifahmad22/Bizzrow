const { parts } = require("./quantity");

function multiplyRounded(a, b, divisor = 1) {
  const left = parts(a);
  const right = parts(b);
  const denominator = 10n ** BigInt(left.scale + right.scale) * BigInt(divisor);
  const numerator = left.digits * right.digits * 100n;
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  const cents = sign * ((absolute * 2n + denominator) / (2n * denominator));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw Object.assign(new Error("Currency amount is outside the safe range"), { status: 400 });
  }
  return Number(cents) / 100;
}

module.exports = { multiplyRounded };
