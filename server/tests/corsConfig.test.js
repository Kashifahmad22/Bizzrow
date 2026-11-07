const test = require("node:test");
const assert = require("node:assert");
const { createCorsOptions } = require("../utils/corsConfig");

test("development CORS allows the configured client and explicit Vite loopback origins", () => {
  const options = createCorsOptions({
    NODE_ENV: "development",
    CLIENT_ORIGIN: "https://bizzrow.example",
  });
  assert.deepEqual(options.origin, [
    "https://bizzrow.example",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  assert.equal(options.credentials, true);
  assert.deepEqual(options.methods, ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
  assert.deepEqual(options.allowedHeaders, ["Content-Type", "Authorization", "Idempotency-Key"]);
  assert.deepEqual(options.exposedHeaders, ["Content-Disposition"]);
});

test("production CORS preserves only the configured production origins", () => {
  const options = createCorsOptions({
    NODE_ENV: "production",
    CLIENT_ORIGIN: "https://bizzrow.example/",
  });
  assert.deepEqual(options.origin, ["https://bizzrow.example"]);
});

test("development CORS can explicitly allow an additional configured local origin", () => {
  const options = createCorsOptions({
    NODE_ENV: "development",
    CLIENT_ORIGIN: "http://localhost:5173",
    CLIENT_ORIGINS: "http://localhost:5174, http://127.0.0.1:5174/",
  });
  assert.deepEqual(options.origin, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ]);
});
