function customerId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw Object.assign(new Error("Customer ID must be a valid ObjectId"), { status: 400 });
  }
  return value.toLowerCase();
}

function customerPhone(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error("Customer phone must be a non-empty string"), { status: 400 });
  }
  return value;
}

module.exports = { customerId, customerPhone };
