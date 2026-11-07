const DEFAULT_INVOICE_TERMS = [
  "Return or exchange requests may be considered within {returnPeriodDays} days of the invoice date, subject to the policy communicated at purchase and applicable law.",
  "Please report any damage or shortage promptly for review.",
  "Goods showing signs of use, washing, alteration, or customer-caused damage may not be eligible for return or exchange, subject to applicable law.",
  "Wholesale and retail goods are governed by the return and exchange policy communicated at purchase and applicable law.",
];

function snapshotInvoiceTerms(business = {}) {
  const configuredPeriod = Number(business.invoiceReturnPeriodDays);
  const returnPeriodDays = Number.isInteger(configuredPeriod) && configuredPeriod >= 0
    ? configuredPeriod
    : 7;
  const configuredTerms = Array.isArray(business.invoiceTerms) ? business.invoiceTerms : DEFAULT_INVOICE_TERMS;
  const terms = configuredTerms
    .filter((term) => typeof term === "string" && term.trim())
    .map((term) => term.trim().replace(/\{returnPeriodDays\}/g, returnPeriodDays > 0
      ? String(returnPeriodDays)
      : "the return period communicated at purchase"));

  return {
    invoiceTermsSnapshot: terms.length >= 2 && terms.length <= 4 ? terms : DEFAULT_INVOICE_TERMS.map((term) =>
      term.replace(/\{returnPeriodDays\}/g, String(returnPeriodDays))),
    invoiceReturnPeriodDaysSnapshot: returnPeriodDays,
  };
}

function invoiceSettingsError(business = {}) {
  if (business.invoiceReturnPeriodDays != null) {
    const period = Number(business.invoiceReturnPeriodDays);
    if (!Number.isInteger(period) || period < 0 || period > 365) {
      return "Invoice return period must be a whole number from 0 to 365.";
    }
  }
  if (business.invoiceTerms != null) {
    const terms = business.invoiceTerms;
    if (!Array.isArray(terms) || terms.length < 2 || terms.length > 4
      || terms.some((term) => typeof term !== "string" || !term.trim() || term.length > 500)) {
      return "Enter 2 to 4 invoice terms, each no longer than 500 characters.";
    }
  }
  return null;
}

module.exports = { DEFAULT_INVOICE_TERMS, snapshotInvoiceTerms, invoiceSettingsError };
