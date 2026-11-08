const test = require("node:test");
const assert = require("node:assert");
const { shouldExposeDevelopmentResetLink } = require("../utils/resetLinkPolicy");

test("reset links are not exposed when the environment is unset", () => {
  assert.equal(shouldExposeDevelopmentResetLink({}), false);
});

test("reset links are not exposed in production even when explicitly enabled", () => {
  assert.equal(shouldExposeDevelopmentResetLink({ NODE_ENV: "production", EXPOSE_DEV_RESET_LINK: "true" }), false);
});

test("development reset links require explicit opt-in", () => {
  assert.equal(shouldExposeDevelopmentResetLink({ NODE_ENV: "development" }), false);
  assert.equal(shouldExposeDevelopmentResetLink({ NODE_ENV: "development", EXPOSE_DEV_RESET_LINK: "true" }), true);
});
