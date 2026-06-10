/**
 * Timezone-safe date-range parsing (Sprint 1.1 — Issue #1).
 *
 * The Sales filter bug came from mixing reference frames: the server parsed
 * `from` as a UTC date but built `to` with server-local setHours(). This module
 * is the single source of truth and never uses server-local time:
 *   - A date-only string "YYYY-MM-DD" → UTC start/end of that day.
 *   - A full ISO instant (what the client now sends for local day boundaries)
 *     → used exactly as given.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseRangeStart(v) {
  if (!v) return null;
  if (DATE_ONLY.test(v)) return new Date(`${v}T00:00:00.000Z`);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseRangeEnd(v) {
  if (!v) return null;
  if (DATE_ONLY.test(v)) return new Date(`${v}T23:59:59.999Z`);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { parseRangeStart, parseRangeEnd };
