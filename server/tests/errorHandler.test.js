const test = require("node:test");
const assert = require("node:assert/strict");
const { errorHandler } = require("../middleware/error");

test("production errors hide internal failures but preserve actionable client errors", () => {
  const previous = process.env.NODE_ENV;
  const log = console.error;
  const logs = [];
  process.env.NODE_ENV = "production";
  console.error = (...args) => logs.push(args);
  try {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    errorHandler(new Error("secret database detail"), { method: "GET", path: "/test" }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Internal server error");
    assert.equal(res.body.stack, undefined);
    assert.equal(logs.length, 1);
    res.statusCode = 200;
    errorHandler(Object.assign(new Error("Invalid input"), { status: 400 }), {}, res);
    assert.equal(res.body.message, "Invalid input");
  } finally {
    console.error = log;
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
