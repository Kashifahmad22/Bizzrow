const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const settingsRoutes = require("../routes/settings");
const { errorHandler } = require("../middleware/error");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("business banking details persist only to the authenticated tenant", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async () => {
  const parsed = new URL(uri);
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname.toLowerCase())
      || !/(^test|[-_]test|testing)/i.test(database)) {
    throw new Error("Settings integration tests require a loopback test database");
  }

  await mongoose.connect(uri, { autoIndex: false });
  const ownerA = new mongoose.Types.ObjectId();
  const ownerB = new mongoose.Types.ObjectId();
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomUUID();

  const app = express();
  app.use(express.json());
  app.use("/settings", settingsRoutes);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  const tokenFor = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET);
  const request = async (id, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/settings`, {
      method,
      headers: {
        Authorization: `Bearer ${tokenFor(id)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };

  try {
    await User.create([
      {
        _id: ownerA,
        name: "Banking Test A",
        email: `${ownerA}@example.invalid`,
        password: crypto.randomUUID(),
        business: { name: "Business A", gstNumber: "GST-A" },
      },
      {
        _id: ownerB,
        name: "Banking Test B",
        email: `${ownerB}@example.invalid`,
        password: crypto.randomUUID(),
        business: {
          name: "Business B",
          bankDetails: { bankName: "Private Bank B", accountNumber: "B-123" },
        },
      },
    ], { ordered: true });

    const legacy = await request(ownerA);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.data.business.gstNumber, "GST-A");
    assert.deepEqual(legacy.data.business.bankDetails, {
      bankName: "",
      accountHolderName: "",
      accountNumber: "",
      ifscCode: "",
      branchName: "",
    });

    const updated = await request(ownerA, "PUT", {
      business: { bankDetails: { bankName: "Example Bank", ifscCode: "abcd0123456" } },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.business.bankDetails.bankName, "Example Bank");
    assert.equal(updated.data.business.bankDetails.ifscCode, "ABCD0123456");

    const ownerAAfter = await request(ownerA);
    assert.equal(ownerAAfter.data.business.bankDetails.accountNumber, "");
    assert.notEqual(ownerAAfter.data.business.bankDetails.bankName, "Private Bank B");
    const ownerBAfter = await request(ownerB);
    assert.equal(ownerBAfter.data.business.bankDetails.bankName, "Private Bank B");
    assert.equal(ownerBAfter.data.business.bankDetails.accountNumber, "B-123");

    const partialUpdate = await request(ownerB, "PUT", {
      business: { bankDetails: { bankName: "Updated Private Bank B" } },
    });
    assert.equal(partialUpdate.status, 200);
    assert.equal(partialUpdate.data.business.bankDetails.bankName, "Updated Private Bank B");
    assert.equal(partialUpdate.data.business.bankDetails.accountNumber, "B-123");

    const invalid = await request(ownerA, "PUT", {
      business: { bankDetails: { accountNumber: 1234 } },
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await User.deleteMany({ _id: { $in: [ownerA, ownerB] } });
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await mongoose.disconnect();
  }
});
