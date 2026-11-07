# Bizzrow MVP Release Readiness Report

**Audit date:** 2026-11-08
**Recommendation:** **HOLD — not signed off for release.** No deployment or production-data access was performed.

## Executive summary

No confirmed P0 or P1 application-code defect was found in the reviewed paths or offline tests. The essential transaction workflows are not release-verified, however: the MongoDB replica-set test was skipped because no isolated test URI is configured, and the available browser session is unauthenticated with no approved test account or safe test dataset. Production behavior was not verified. These gaps prevent a release sign-off under the requested acceptance criteria.

No application code was changed during this audit. The only file created is this report.

## Findings and severity

| Severity | Finding | Status / required action |
|---|---|---|
| P0 | No confirmed P0 defect found by code review and offline tests. This is not a runtime security guarantee. | No code fix made. Complete the runtime and tenant-isolation checks below before release. |
| P1 — release gate | MongoDB transaction, concurrency, and database-state behavior is unverified. The integration test requires `FINANCIAL_TEST_MONGO_URI`; it was not configured. The test itself restricts connections to a loopback host and a database name containing `test`. | Run it against a disposable local replica set, then verify fixture cleanup and final database state. Do not substitute the application `.env` database. |
| P1 — release gate | Authenticated browser workflows, including duplicate review, sales, returns, invoices, and ledger payments, were not tested. The shared browser was at `/login`; no test account or safe test data was available. | Run the requested desktop/mobile journey with an approved test account and isolated test database. |
| P1 — conditional | The current sale model does not calculate or persist GST/tax. Invoice code displays tax only when saved tax data is present and does not infer a rate. | Release only to businesses for which non-tax invoices are acceptable. If GST invoices are required, treat the absence of tax calculation and persisted tax data as a blocker; do not represent these invoices as GST-compliant. |
| P2 | Physical thermal printer output, driver margins, and browser `@page` behavior were not tested. PDF page dimensions were covered by unit tests. | Verify representative 80mm/58mm printers before promising printer compatibility. |
| P2 | PDFKit's built-in fonts may not render all Indic scripts. | Validate actual business/customer names in generated PDFs; add a suitable licensed font only if required. |
| P2 | Vite reports a minified JavaScript chunk above 500 kB. The production build succeeds. | Consider code splitting separately; not treated as an MVP functional blocker. |
| P2 / scope note | Duplicate canonical selection is held in modal React state keyed by the two persisted product IDs. It survives re-renders while the modal is open, but is not a durable server-side canonical-product setting and resets after closing/reloading. Deletion remains a separate explicit action; no products are merged. | Confirm whether durable canonical designation is actually required. No persistent canonical registry was added during this verification sprint. |

## Workflow verification matrix

“Unit tested” means offline tests only; it does not imply database or browser verification.

| Workflow | Code reviewed | Unit tested | Integration tested | Browser tested | Production verified |
|---|---|---|---|---|---|
| Duplicate detection and review | Yes — `client/src/pages/Products.jsx` (`DuplicateReviewModal`), `client/src/lib/duplicateReview.js`, `server/routes/products.js`, `server/utils/productDuplicates.js` | Yes — duplicate-pair/key tests and backend duplicate-detection tests passed. No React component interaction test exists. | No | No — no authenticated session | No |
| Product deletion safeguards | Yes — `server/services/productDeletion.js` (`deleteUnusedProduct`), `server/routes/products.js` | Yes — zero-stock eligible deletion; stock, sales/replacement, returns, batch history, tenant ownership, invalid ID, and concurrent-change checks | No | No | No |
| Batch creation, FIFO deduction, returns, stock reconciliation | Yes — `server/routes/products.js`, `server/services/stockBatchService.js`, `server/services/stockService.js`, `server/routes/sales.js` | Yes — service tests cover stock reconciliation, FIFO allocation, original-batch restoration, and atomic helper behavior. Route-level retry persistence is not integration-tested. | No | No | No |
| Retail/wholesale sale, discounts, payments, returns/replacements, ledger | Yes — `server/routes/sales.js`, `server/routes/ledger.js`, `server/services/financialTransaction.js`, `server/services/paymentAllocation.js`, `server/utils/saleMath.js` | Yes — offline tests cover discounts, returns, payment splits/overpayment, replacement credit, ledger allocation, collections, and idempotency helpers. | No — replica-set suite skipped | No | No |
| A4/thermal invoice, browser-print HTML, saved totals and terms | Yes — `server/services/invoicePdf.js`, `server/routes/sales.js`, `server/utils/invoiceTerms.js`, `client/src/lib/invoicePrint.js`, `client/src/pages/Sales.jsx`, `client/src/pages/Settings.jsx` | Yes — PDF generation/pagination, 80mm/58mm dimensions, saved amounts, missing-tax behavior, terms, browser-print escaping, and formats | No — invoice API and WhatsApp resend were not exercised against a database/service | No authenticated application workflow. Fictional previews/PDFs are not live sale verification. | No |
| Authentication, logout, API authorization, tenant isolation | Yes — `server/routes/auth.js`, `server/middleware/auth.js`, protected route mounts, owner-scoped data queries, `client/src/context/AuthContext.jsx` | Partial — token-version/reset-policy and route-adjacent tests pass; no end-to-end auth or cross-tenant API test exists | No | No — login/logout and Business A/Business B access were not exercised | No |

## Detailed audit notes

### Inventory and duplicate products

- Duplicate results are requested from `/api/products/duplicates`; the route filters products by the authenticated owner. Backend records include `productId`, and the frontend normalizer rejects missing or repeated IDs.
- Pair keys derive from sorted member product IDs; product cards use persisted product IDs. The selection handler stores the selected ID per pair, and the unselected product's delete control is rendered disabled until selection.
- Deletion asks for explicit confirmation and calls the existing authenticated `DELETE /api/products/:id` endpoint. Backend deletion is transaction-wrapped and refuses nonzero stock, sale/replacement references, return/replacement references, and any batch history. The delete predicate rechecks ownership and zero stock.
- Batch creation uses an idempotency key and a fingerprint scoped to the owner, operation, and product. Replays resolve the prior batch record; a reused key with changed request data is rejected. The service creates the batch and increments product stock in the same transaction with an optimistic stock predicate.
- Sale stock deduction consolidates duplicate product lines before checking quantity and uses a conditional `$gte` stock update. FIFO batch deductions and return restoration use transaction sessions and conditional batch updates.
- These conclusions are code-review and unit-test evidence only. No live duplicate selection/deletion, batch retry, sale, or return was performed.

### Financial and billing integrity

- Sale creation, returns, replacements, and ledger payments require an `Idempotency-Key` and run through the transaction helper. Unsupported MongoDB transaction capability produces an explicit service error; there is no non-transactional fallback.
- Payment split normalization accepts cash, UPI, bank, and card tenders, rejects overpayment, and keeps carried replacement credit separate from collected payment. Ledger allocation checks customer outstanding against open sale balances.
- Return allocation distributes saved sale value proportionally across discounted item lines and conserves cents across partial returns. Return settlement reconciles outstanding balance, actual tender, carried credit, and due.
- The client financial-mutation hook retains a request key/fingerprint in session storage for retry after an uncertain response and blocks a changed request until the prior pending request is resolved or discarded.
- Test coverage exercises pure calculations and transaction helper behavior. It does not prove concurrent database writes or ledger/customer state at runtime.

### Invoices

- Invoice endpoints load sales and return records using the authenticated owner. PDF generation and WhatsApp resend use saved sale snapshots and the shared PDF service.
- New sale and replacement-sale paths snapshot invoice terms and available customer/product details. Legacy records without snapshots remain readable; customer details can fall back to the current customer profile where historical snapshots are absent.
- A4 pagination and thermal PDF dimensions pass unit tests. Browser-print HTML uses saved values and escapes text. Physical printers and the live invoice download/WhatsApp flows were not tested.
- Tax is not calculated by the current sale model. The invoice must not be described as tax-compliant unless the required tax values were saved by an existing supported path.

### Authentication, tenant isolation, and sensitive data

- Protected API route modules use `protect`; data access reviewed for products, customers, sales, invoices, settings, dashboard, WhatsApp, and ledger is owner-scoped.
- Login/reset responses use a public-user projection rather than serializing the user document. Passwords are hashed; reset tokens are stored as hashes; development reset links require explicit development-only opt-in. The request logger records request metadata and does not log request bodies or authorization headers.
- This was static review, not cross-tenant runtime testing. No claim is made that Business A was actually prevented from reading or modifying Business B's records during this sprint.

## Test and build results

- Backend: `node --test` — **110 tests, 109 passed, 0 failed, 1 skipped**. The skipped case is `financialTransaction.integration.test.js`; `FINANCIAL_TEST_MONGO_URI` was not configured.
- Frontend tests: `node --test` — **6 passed, 0 failed** (duplicate-review helper and invoice-print helper tests).
- Frontend production build: `npm run build` — **passed**. Vite emitted the existing >500 kB chunk warning.
- Backend syntax checks: entrypoint plus JavaScript files under routes/services/utils/middleware — **passed**.
- No production database was accessed, no API was started, and no production data or migrations were changed.

## Files changed in this audit

- `MVP_RELEASE_READINESS_REPORT.md` — added.
- No application source, tests, deployment configuration, database indexes, Git metadata, or production data were changed.
- At audit time, the workspace resolved Git to a parent Windows repository, not to an independent Bizzrow repository. Pre-existing parent-worktree changes were left untouched; do not commit from that parent as part of that sign-off.

## Deferred verification and deployment checklist

Before approving deployment:

1. Provide an isolated loopback MongoDB replica set and set `FINANCIAL_TEST_MONGO_URI` only for the test process. Run the integration suite and verify that it exercises transaction rollback, concurrent stock sales, concurrent returns, idempotency replay, and final fixture cleanup. Add/perform isolated batch retry and deletion checks if not covered by that suite.
2. Provide an approved test account and disposable tenant/test data. Exercise login/logout, cross-tenant access denial, duplicate selection and safe deletion, batch receipt, retail and wholesale sales, split payments, ledger payment, partial return/replacement, A4/thermal download, and WhatsApp resend where configured. Repeat essential flows at desktop and mobile widths.
3. Decide whether GST invoices are required for the MVP. If yes, do not release until tax calculation and persisted invoice tax values are supported and verified. Do not infer tax from current product settings.
4. Confirm release environment configuration out-of-band: production `NODE_ENV`, strong `JWT_SECRET`, production origins, and a transaction-capable MongoDB deployment. Do not print or include secret values in the report.
5. Before deployment, take and verify a restorable database backup and record the exact application revision/configuration. No migration was introduced in this sprint.
6. Prepare rollback to the prior application revision and verify schema compatibility. Avoid rolling back after writes using any schema or behavior not understood by the prior revision; restore data only through the approved recovery procedure, not an automatic destructive rollback.

**Sign-off:** **Not granted.** Reassess after the isolated integration and authenticated browser checks pass and any conditional GST requirement is resolved. No deployment was performed; approval is required before a deployment phase.
