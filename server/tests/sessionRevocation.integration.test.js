const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const RevokedSession = require("../models/RevokedSession");
const { errorHandler } = require("../middleware/error");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");

const uri = process.env.FINANCIAL_TEST_MONGO_URI;

test("logout revokes only the current token and password reset revokes other sessions", {
  skip: uri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  await connectIsolatedMongo(uri, [User, RevokedSession]);
  t.after(() => mongoose.disconnect());
  process.env.JWT_SECRET = crypto.randomUUID();
  const password = "synthetic-password";
  const user = await User.create({ name: "Synthetic", email: `${crypto.randomUUID()}@example.invalid`, password });
  const app = express();
  app.use(express.json());
  app.use("/auth", require("../routes/auth"));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function request(path, { token, data } = {}) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/auth${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: res.status, data: await res.json() };
  }
  const first = await request("/login", { data: { email: user.email, password } });
  const second = await request("/login", { data: { email: user.email, password } });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.data.token, second.data.token);
  assert.equal((await request("/me", { token: first.data.token })).status, 200);
  assert.equal((await request("/logout", { token: first.data.token, data: {} })).status, 200);
  assert.equal((await request("/me", { token: first.data.token })).status, 401);
  assert.equal((await request("/logout", { token: first.data.token, data: {} })).status, 200);
  assert.equal((await request("/me", { token: first.data.token })).status, 401);
  assert.equal((await request("/me", { token: second.data.token })).status, 200);
  const expired = jwt.sign({ id: String(user._id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await request("/me", { token: expired })).status, 401);
  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.resetTokenExpiresAt = new Date(Date.now() + 60000);
  await user.save();
  const reset = await request("/reset-password", { data: { token: rawToken, password: "new-synthetic-password" } });
  assert.equal(reset.status, 200);
  assert.equal((await request("/me", { token: second.data.token })).status, 401);
  assert.equal((await request("/me", { token: reset.data.token })).status, 200);
});
