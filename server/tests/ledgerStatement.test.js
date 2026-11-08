const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLedgerStatement } = require("../services/ledgerStatement");
const { buildLedgerStatementPdf } = require("../services/pdfService");
const zlib = require("node:zlib");

test("statement keeps paise in opening, running and closing balances", async () => {
  const customer = { _id: "customer", name: "Test customer" };
  const statement = buildLedgerStatement(customer, [
    { _id: "1", createdAt: "2026-01-01T00:00:00Z", amount: 100.50 },
    { _id: "2", createdAt: "2026-01-02T00:00:00Z", amount: -10.25 },
    { _id: "3", createdAt: "2026-01-03T00:00:00Z", amount: 0.10 },
  ], "2026-01-02", "2026-01-03");
  assert.equal(statement.openingBalance, 100.50);
  assert.deepEqual(statement.entries.map((entry) => entry.balance), [90.25, 90.35]);
  assert.equal(statement.closingBalance, 90.35);
  const pdf = await buildLedgerStatementPdf(customer, {}, statement);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const content = pdf.toString("latin1");
  const streams = [...content.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try { return zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"); }
      catch (error) {
        if (error.code !== "Z_DATA_ERROR") throw error;
        return "";
      }
    }).join("\n");
  assert.match(streams, /39302e3335/);
});
