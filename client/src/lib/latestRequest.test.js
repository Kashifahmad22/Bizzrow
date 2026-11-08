import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequest } from "./latestRequest.js";

test("starting a search request aborts and invalidates the previous request", () => {
  const requests = createLatestRequest();
  const earlier = requests.start();
  const latest = requests.start();

  assert.equal(earlier.signal.aborted, true);
  assert.equal(earlier.isCurrent(), false);
  assert.equal(latest.signal.aborted, false);
  assert.equal(latest.isCurrent(), true);
});

test("cancel invalidates the current request for cleared searches and unmounts", () => {
  const requests = createLatestRequest();
  const current = requests.start();

  requests.cancel();

  assert.equal(current.signal.aborted, true);
  assert.equal(current.isCurrent(), false);
});
