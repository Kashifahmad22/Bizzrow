const { parseRangeStart, parseRangeEnd } = require("../utils/dateRange");
const { round2 } = require("../utils/saleMath");

function buildLedgerStatement(customer, all, from, to) {
  const fromDate = parseRangeStart(from);
  const toDate = parseRangeEnd(to);
  let opening = 0;
  const inRange = [];
  for (const entry of all) {
    const time = new Date(entry.createdAt).getTime();
    if (fromDate && time < fromDate.getTime()) {
      opening += entry.amount;
    } else if (!toDate || time <= toDate.getTime()) {
      inRange.push(entry);
    }
  }

  let running = opening;
  const entries = inRange.map((entry) => {
    running += entry.amount;
    return {
      _id: entry._id, date: entry.createdAt, type: entry.type, note: entry.note,
      amount: entry.amount, balance: round2(running),
    };
  });
  return {
    customer: { _id: customer._id, name: customer.name, phone: customer.phone, shopName: customer.shopName },
    openingBalance: round2(opening),
    closingBalance: round2(running),
    entries,
    from: fromDate,
    to: toDate,
  };
}

module.exports = { buildLedgerStatement };
