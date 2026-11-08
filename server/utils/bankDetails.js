const BANK_DETAIL_LIMITS = {
  bankName: 120,
  accountHolderName: 120,
  accountNumber: 34,
  ifscCode: 11,
  branchName: 120,
};

function normalizeBankDetails(value) {
  if (value == null) value = {};
  if (typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("Bank details must be an object.");
    error.status = 400;
    throw error;
  }

  const providedFields = Object.entries(BANK_DETAIL_LIMITS)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(value, field));

  return Object.fromEntries(providedFields.map(([field, maxLength]) => {
    const raw = value[field] == null ? "" : value[field];
    if (typeof raw !== "string") {
      const error = new Error(`${field} must be text.`);
      error.status = 400;
      throw error;
    }
    const normalized = raw.trim();
    if (normalized.length > maxLength) {
      const error = new Error(`${field} must be no longer than ${maxLength} characters.`);
      error.status = 400;
      throw error;
    }
    return [field, field === "ifscCode" ? normalized.toUpperCase() : normalized];
  }));
}

module.exports = { normalizeBankDetails };
