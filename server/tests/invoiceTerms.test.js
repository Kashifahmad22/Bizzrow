const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_INVOICE_TERMS, invoiceSettingsError, snapshotInvoiceTerms } = require("../utils/invoiceTerms");

test("invoice term snapshots resolve configured return periods without changing source settings", () => {
  const business = {
    invoiceReturnPeriodDays: 14,
    invoiceTerms: [...DEFAULT_INVOICE_TERMS],
  };
  const snapshot = snapshotInvoiceTerms(business);
  assert.equal(snapshot.invoiceReturnPeriodDaysSnapshot, 14);
  assert.match(snapshot.invoiceTermsSnapshot[0], /within 14 days/);
  assert.match(business.invoiceTerms[0], /\{returnPeriodDays\}/);
});

test("zero return period uses neutral configured wording and legacy policy can be snapshotted", () => {
  const snapshot = snapshotInvoiceTerms({
    invoiceReturnPeriodDays: 0,
    invoiceTerms: [...DEFAULT_INVOICE_TERMS],
  });
  assert.match(snapshot.invoiceTermsSnapshot[0], /return period communicated at purchase/);
  assert.equal(snapshot.invoiceReturnPeriodDaysSnapshot, 0);
});

test("invoice policy settings validate term count, length, and return period", () => {
  assert.equal(invoiceSettingsError({
    invoiceReturnPeriodDays: 30,
    invoiceTerms: ["One", "Two"],
  }), null);
  assert.match(invoiceSettingsError({ invoiceReturnPeriodDays: -1 }), /whole number/);
  assert.match(invoiceSettingsError({ invoiceReturnPeriodDays: 1.5 }), /whole number/);
  assert.match(invoiceSettingsError({ invoiceTerms: ["Only one"] }), /2 to 4/);
  assert.match(invoiceSettingsError({ invoiceTerms: ["One", "Two", "Three", "Four", "Five"] }), /2 to 4/);
  assert.match(invoiceSettingsError({ invoiceTerms: ["One", "x".repeat(501)] }), /500 characters/);
});
