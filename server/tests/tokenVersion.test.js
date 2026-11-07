const test = require("node:test");
const assert = require("node:assert");
const { tokenVersionMatches } = require("../utils/tokenVersion");

test("legacy tokens without a version match users at the default version", () => {
  assert.equal(tokenVersionMatches(undefined, 0), true);
});

test("current token versions match", () => {
  assert.equal(tokenVersionMatches(3, 3), true);
});

test("older token versions are revoked after a password reset", () => {
  assert.equal(tokenVersionMatches(0, 1), false);
});

test("a missing user version is treated as the legacy default", () => {
  assert.equal(tokenVersionMatches(0, undefined), true);
});
