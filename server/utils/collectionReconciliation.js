const ACTUAL_TENDER_METHODS = ["cash", "upi", "bank", "card"];

function emptyMethods() {
  return { cash: 0, upi: 0, bank: 0, card: 0, credit: 0 };
}

function methodAggToObject(rows) {
  const breakdown = emptyMethods();
  let total = 0;
  for (const row of rows) {
    if (!ACTUAL_TENDER_METHODS.includes(row._id)) continue;
    breakdown[row._id] = Math.round((breakdown[row._id] + (row.amount || 0)) * 100) / 100;
    total += row.amount || 0;
  }
  return { breakdown, total: Math.round(total * 100) / 100 };
}

function refundCollectionPipeline(ownerId, createdAt, { trend = false } = {}) {
  const fallbackRefund = {
    $cond: [
      { $gt: [{ $ifNull: ["$cashRefund", 0] }, 0] },
      "$cashRefund",
      {
        $add: [
          { $ifNull: ["$cashRefundFromCredit", 0] },
          { $ifNull: ["$cashRefundFromLedger", 0] },
        ],
      },
    ],
  };
  const stages = [
    { $match: { owner: ownerId, createdAt } },
    {
      $project: {
        createdAt: 1,
        refundPayments: { $ifNull: ["$refundPayments", []] },
        legacyRefund: fallbackRefund,
      },
    },
    { $addFields: { refundPaymentCount: { $size: "$refundPayments" } } },
    { $unwind: { path: "$refundPayments", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        createdAt: 1,
        method: {
          $cond: [{ $gt: ["$refundPaymentCount", 0] }, "$refundPayments.method", "cash"],
        },
        amount: {
          $cond: [
            { $gt: ["$refundPaymentCount", 0] },
            {
              $cond: [
                { $in: ["$refundPayments.method", ACTUAL_TENDER_METHODS] },
                { $ifNull: ["$refundPayments.amount", 0] },
                0,
              ],
            },
            "$legacyRefund",
          ],
        },
      },
    },
    { $match: { amount: { $gt: 0 } } },
  ];

  if (trend) {
    stages.push({
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        amount: { $sum: "$amount" },
      },
    });
  } else {
    stages.push({
      $group: { _id: "$method", amount: { $sum: "$amount" } },
    });
  }
  return stages;
}

module.exports = { ACTUAL_TENDER_METHODS, emptyMethods, methodAggToObject, refundCollectionPipeline };
