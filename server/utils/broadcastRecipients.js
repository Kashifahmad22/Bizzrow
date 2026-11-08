const { customerId } = require("./customerInput");

function broadcastRecipients({ allCustomers, customerIds }) {
  if (allCustomers === true && customerIds === undefined) return null;
  if (allCustomers !== undefined && allCustomers !== false) {
    throw Object.assign(new Error("Select recipients or explicitly confirm all customers"), { status: 400 });
  }
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    throw Object.assign(new Error("Select at least one customer or explicitly confirm all customers"), { status: 400 });
  }
  return customerIds.map(customerId);
}

module.exports = { broadcastRecipients };
