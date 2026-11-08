const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { rateLimit, configuredRateLimit, authRateLimits } = require("../middleware/rateLimit");

test("per-client rate limits recover after the window without trusting headers", () => {
  let time = 0;
  const limit = rateLimit({ limit: 2, windowMs: 1000, now: () => time });
  let passed = 0;
  const response = {
    set(name, value) { this[name] = value; return this; },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; },
  };
  const request = { ip: "127.0.0.1", headers: { "x-forwarded-for": "1.2.3.4" } };
  limit(request, response, () => passed++);
  limit(request, response, () => passed++);
  limit(request, response, () => passed++);
  assert.equal(passed, 2);
  assert.equal(response.code, 429);
  assert.equal(response["Retry-After"], "1");
  time = 1000;
  limit(request, response, () => passed++);
  assert.equal(passed, 3);
});

test("invalid environment limits fail during setup", () => {
  assert.throws(() => configuredRateLimit("AUTH", 1, 1000, { RATE_LIMIT_AUTH_MAX: "0" }), /positive integer/);
});

test("authentication rate limits cover Express case and trailing-slash variants", async (t) => {
  const app = express();
  app.use("/api/auth", authRateLimits(rateLimit({ limit: 1, windowMs: 60000 }), rateLimit({ limit: 1, windowMs: 60000 })));
  app.post(["/api/auth/login", "/api/auth/forgot-password"], (_req, res) => res.sendStatus(204));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: "POST" });
  assert.equal((await post("/api/auth/login")).status, 204);
  assert.equal((await post("/API/AUTH/LOGIN/")).status, 429);
  assert.equal((await post("/api/auth/forgot-password")).status, 204);
  assert.equal((await post("/api/auth/FORGOT-PASSWORD/")).status, 429);
});
