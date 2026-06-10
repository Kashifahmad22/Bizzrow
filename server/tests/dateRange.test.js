const test = require("node:test");
const assert = require("node:assert");
const { parseRangeStart, parseRangeEnd } = require("../utils/dateRange");

test("date-only start parses to UTC midnight (no server-local drift)", () => {
  assert.equal(parseRangeStart("2026-06-08").toISOString(), "2026-06-08T00:00:00.000Z");
});

test("date-only end parses to UTC end-of-day", () => {
  assert.equal(parseRangeEnd("2026-06-08").toISOString(), "2026-06-08T23:59:59.999Z");
});

test("full ISO instant passes through unchanged (client local boundaries)", () => {
  const iso = "2026-06-07T18:30:00.000Z"; // e.g. IST midnight
  assert.equal(parseRangeStart(iso).toISOString(), iso);
  assert.equal(parseRangeEnd(iso).toISOString(), iso);
});

test("empty / invalid returns null", () => {
  assert.equal(parseRangeStart(""), null);
  assert.equal(parseRangeEnd(undefined), null);
  assert.equal(parseRangeStart("not-a-date"), null);
});

test("yesterday range is non-empty and ordered", () => {
  const start = parseRangeStart("2026-06-07");
  const end = parseRangeEnd("2026-06-07");
  assert.ok(start.getTime() < end.getTime());
  assert.equal(end.getTime() - start.getTime(), 86400000 - 1);
});
