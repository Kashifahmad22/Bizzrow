const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBankDetails } = require("../utils/bankDetails");

test("bank details are optional and normalization preserves partial updates and account number formatting", () => {
  assert.deepEqual(normalizeBankDetails(), {});
  assert.deepEqual(normalizeBankDetails({ bankName: "Example Bank" }), { bankName: "Example Bank" });
  assert.deepEqual(normalizeBankDetails({
    bankName: "  Example Bank ",
    accountHolderName: "  Shop Owner ",
    accountNumber: " 001234 ",
    ifscCode: " abcd0123456 ",
    branchName: " Main Branch ",
  }), {
    bankName: "Example Bank",
    accountHolderName: "Shop Owner",
    accountNumber: "001234",
    ifscCode: "ABCD0123456",
    branchName: "Main Branch",
  });
});

test("bank detail values and field lengths are validated", () => {
  assert.throws(() => normalizeBankDetails("not an object"), { status: 400 });
  assert.throws(() => normalizeBankDetails({ accountNumber: 1234 }), /must be text/);
  assert.throws(() => normalizeBankDetails({ ifscCode: "x".repeat(12) }), /11 characters/);
});
