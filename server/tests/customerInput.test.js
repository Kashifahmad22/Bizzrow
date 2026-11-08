const test = require("node:test");
const assert = require("node:assert/strict");
const { customerId, customerPhone } = require("../utils/customerInput");
const { broadcastRecipients } = require("../utils/broadcastRecipients");

test("customer IDs and phones reject query operators, arrays and malformed values", () => {
  assert.equal(customerId("ABCDEF0123456789ABCDEF01"), "abcdef0123456789abcdef01");
  assert.equal(customerPhone("123 456"), "123 456");
  for (const value of [{ $ne: null }, [], "invalid", null]) assert.throws(() => customerId(value), { status: 400 });
  for (const value of [{ $ne: "" }, [], "", "  ", 123]) assert.throws(() => customerPhone(value), { status: 400 });
});

test("broadcasts require a nonempty selection or explicit all-customer intent", () => {
  const id = "abcdef0123456789abcdef01";
  assert.equal(broadcastRecipients({ allCustomers: true }), null);
  assert.deepEqual(broadcastRecipients({ customerIds: [id] }), [id]);
  for (const value of [{}, { customerIds: [] }, { customerIds: {} }, { customerIds: [{ $ne: null }] },
    { allCustomers: true, customerIds: [] }, { allCustomers: "true" }]) {
    assert.throws(() => broadcastRecipients(value), { status: 400 });
  }
});
