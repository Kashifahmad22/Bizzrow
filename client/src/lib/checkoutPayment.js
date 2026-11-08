function toPaise(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ""] = String(value).split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

export function calculateCheckoutPayment(total, inputs) {
  const totalPaise = toPaise(total);
  const amounts = Object.fromEntries(
    ["cash", "upi", "bank", "card"].map((method) => [
      method,
      inputs[method] === "" ? 0 : toPaise(inputs[method]),
    ])
  );
  if (totalPaise === null || Object.values(amounts).some((amount) => amount === null)) {
    return { error: "Enter valid payment amounts with at most two decimal places." };
  }
  const nonCash = amounts.upi + amounts.bank + amounts.card;
  if (!Number.isSafeInteger(nonCash) || nonCash > totalPaise) {
    return { error: "Non-cash payments cannot exceed the invoice total." };
  }
  if (totalPaise === 0 && amounts.cash > 0) {
    return { error: "Cash tender is not allowed for a zero-value sale." };
  }
  const applied = Math.min(amounts.cash, totalPaise - nonCash);
  return {
    cashApplied: applied / 100,
    change: (amounts.cash - applied) / 100,
    paid: (nonCash + applied) / 100,
    due: (totalPaise - nonCash - applied) / 100,
    remainingCash: (totalPaise - nonCash) / 100,
  };
}
