# Bizzrow MVP final release readiness report

## Mobile and release gate — latest assessment

**Recommendation: HOLD.** The local mobile header defect below was fixed, but a full interactive mobile and desktop workflow audit, production configuration review and a valid release-branch comparison are not complete. This section supersedes earlier status statements. No release candidate, deployment or production verification is claimed.

### Environment and branch identification

- At audit time, the Git root was a parent Windows repository on branch `bizz-version-1.0`, at `54e3f01`. The designated Bizzrow folder was entirely untracked in that parent repository. The parent worktree had 85 unrelated tracked changes; none were discarded or modified for that audit.
- The user identified `Kashifahmad22/Bizzrow` and `main` for both the requested release target and production mapping. Read-only GitHub branch listing showed `main` at `8e7f9ee` and `vercel/install-vercel-web-analytics-b3bd7r`; `main` is the default branch. The local `Bizzrow/main` tracking ref matched that main SHA at inspection time. Hosting-provider settings and actual deployed revision were **not independently verified**.
- The untracked local folder cannot be identified as the contents of any release branch. The user identified the same `main` branch for production and release, not a separate promotion branch. No exact promotion procedure can be confirmed from this evidence. Before approval, identify a tracked release revision and confirm frontend/backend branch connections, deployment triggers and rollback procedure in the hosting systems. Do not push or merge as part of this audit.
- The local `client/vercel.json` only contains the SPA rewrite; it does not identify a production-connected branch. README references Vercel and Railway, which is not proof of their current settings.

### Verified mobile finding and correction

| Severity | Expected / actual | Correction and retest |
| --- | --- | --- |
| P1 | At 320, 375 and 430 pixel widths, Products actions should stay on-screen. Before the fix, the document expanded to about 604 CSS pixels and Review Duplicates and Add product extended outside the viewport. The non-shrinking header action container caused the overflow. | `client/src/components/PageHeader.jsx` now stacks title and actions below the `sm` breakpoint and allows the action area to fit the screen; the existing desktop row remains at `sm` and wider. Browser geometry checks after the fix showed no page-level horizontal overflow and all three header actions within the viewport at 320 x 700, 375 x 812, 430 x 932, 768 x 1024, 1366 x 768 and 700 x 320. |

This is a layout-only change; no backend or financial calculations were changed. It was checked in a running local browser, not on physical devices. No automated browser regression test was added.

### Mobile route matrix

`G` means a page-level browser geometry sweep only, not a complete interactive or visual pass. The sweep checked page scroll width and horizontally off-screen buttons; it cannot detect every clipped element, overlap, chart defect, or keyboard obstruction. Each listed screen remains **NOT VERIFIED** as a complete workflow unless explicitly stated.

| Screen / workflow | Viewports and evidence | Status / remaining checks |
| --- | --- | --- |
| Login, registration, forgot/reset password | G at 320 x 700, 375 x 812, 430 x 932, 768 x 1024, 1366 x 768 and 700 x 320; no document overflow. A new synthetic account registered at 320 x 700; an earlier local run exercised logout/login. | NOT VERIFIED: physical keyboard, validation messages, all auth flows and reset completion. |
| Dashboard and business health/analytics widgets | G at all six sizes; no document-level overflow. | NOT VERIFIED: populated charts, filters, readability and interaction at every viewport. |
| Products, filters and duplicate review | G at all six sizes; prior overflow fixed and retested as above. | NOT VERIFIED: full interaction matrix, filtering, all variants and physical touch targets. Previous isolated desktop duplicate selection/deletion passed. |
| Product creation, batch and stock adjustment | At 320 x 700, created a synthetic product with stock 5, received a batch of 4 (total 9), then corrected legacy stock by -1 with reason, showing total 8 and an audit entry. The batch table uses an internal horizontal scroller. | Partial browser PASS for those actions only; edit/delete, retry and all viewport combinations NOT VERIFIED here. Prior route tests checked idempotency/reason behavior. |
| Sales, customer, pricing, discounts and payments | G at all six sizes; new-sale customer-step modal and footer measured within viewport at all six sizes. At 320 x 700, completed a retail walk-in cash sale of 100 and saw invoice paid 100/due 0. | NOT VERIFIED as full mobile workflow: wholesale, discounts, split/credit and other sale steps at each size; keyboard interaction and accidental scrolling. |
| Invoice preview and controls | At 320 x 700, invoice for the synthetic sale showed item, 100 total, 100 paid and 0 due; item table scrolls horizontally; download/print controls were visible. | NOT VERIFIED at all viewports and on physical devices. Printing and download implementation was not reopened in this mobile audit. |
| Returns and replacements | Earlier isolated desktop/API evidence below includes discounted partial/full returns and even/higher/lower replacements. | NOT VERIFIED as complete mobile browser workflows. |
| Ledger and customers | G at all six sizes, no page-level overflow; earlier desktop payment settlement passed. | NOT VERIFIED: all mobile create/edit/payment/statement interactions and paise readability. |
| Intelligence | G at all six sizes; no page-level overflow. | NOT VERIFIED: populated insights and interactive charts. |
| WhatsApp | G at all six sizes; no page-level overflow. | NOT VERIFIED: configured provider workflows and all controls. |
| Settings | G at all six sizes; no page-level overflow. | NOT VERIFIED: all settings forms, validation and keyboard behavior. |
| Navigation drawer, dropdowns, toast, other modal states | New-sale modal footer measured within viewport at the six sizes above; the stock modal was exercised at 320. | NOT VERIFIED across all screens, orientations, menus and real keyboards. |

### Regression and integration results

After the header correction, with an isolated loopback MongoDB replica set:

- Complete backend suite: **121 passed, 0 failed, 0 skipped**, including financial, inventory and split-payment integration tests.
- Frontend tests: **7 passed, 0 failed, 0 skipped**.
- Frontend production build: **PASS**, with the existing chunk-size warning.
- Desktop: header geometry at 1366 x 768 and 768 x 1024 passed the narrow checks; **full desktop regression is NOT VERIFIED**.
- A prior separate isolated integration run passed **3 tests, 0 failed, 0 skipped**; the current full suite includes those integration files. No production database was used.

### Business workflow status

| Workflow | Evidence / result |
| --- | --- |
| Register and login | Synthetic registration at 320; prior local browser logout/login passed. |
| Create product; receive batch | Current mobile synthetic product and batch passed as described above. |
| Stock adjustment with reason and idempotency | Current mobile reason and audit record observed; prior isolated API checks verified missing key/reason rejection, identical-key replay and changed-body conflict. Current mobile request key was not independently inspected. |
| Retail cash | Current mobile retail walk-in 100 cash; invoice shows 100 paid and 0 due. |
| Wholesale, UPI and split | Earlier isolated desktop wholesale sale 140, cash 50, UPI 60, due 30; separate API wholesale UPI sale 144. Not re-exercised on mobile during this gate. |
| Credit sale and ledger collection | Earlier isolated desktop sale due 30 and cash ledger payment of 30 produced customer and invoice due 0. Full mobile credit workflow and exact-paise variants remain NOT VERIFIED. |
| Partial and full returns | Earlier isolated desktop discounted sale returned 70 twice, restoring stock to 6 and net/paid/due and collections to 0; current mobile return not exercised. |
| Equal, higher, lower replacements | Earlier isolated API cases passed expected totals, credit and refunds; mobile browser cases and a fresh paise-level end-to-end rerun remain NOT VERIFIED. |
| Inventory restoration/allocation | Earlier isolated transaction integrations and desktop return evidence passed; current mobile end-to-end restoration not exercised. |
| Customer balances and collections | Earlier isolated desktop and route-integration checks reconciled the tested scenarios; historical records without tender snapshots remain explicitly incomplete. All combinations and time ranges NOT VERIFIED. |
| Tenant isolation | Prior two-account isolated tests covered selected product, batch, sale, invoice, ledger, customer and settings paths; exhaustive route isolation remains NOT VERIFIED. |
| Rollback and concurrency | Current full backend suite included isolated transaction integration cases covering rollback, retries, concurrent stock and returns. Every browser transaction was not separately fault-injected. |

### Security and configuration notes

- Code review: protected routes use `protect`, JWT verification and owner lookup; selected earlier isolated cross-tenant probes passed. This is not a complete security audit.
- `client/src/api/client.js` falls back to a localhost API when `VITE_API_URL` is unset. The production build must explicitly receive the intended non-local API URL; the actual production environment was not read or verified.
- `server/utils/corsConfig.js` accepts configured origins and defaults to a localhost origin when `CLIENT_ORIGIN` is absent; the actual production CORS settings remain unverified. `server/config/db.js` requires `MONGO_URI`; its production value and database were not read. JWT signing configuration and secrets were not inspected.
- Production errors omit stack traces, but `server/middleware/error.js` returns the error message; sensitive error-message exposure needs dedicated verification. No secret values were printed or deliberately read.
- No complete secret scan of a tracked release branch is possible while the audited folder is untracked. `.vscode/settings.json`, the migration script, lockfile, tests and reports are additional files requiring release review; no file is assumed safe merely because its name is listed. No migration was executed.

### Local folder versus cached `Bizzrow/main`

A read-only content-hash comparison against the locally cached tracking tree, not a branch diff, found **78 identical, 30 changed, 0 missing and 50 additional** files, excluding environment files and generated/dependency directories. No release branch or commit contains these local changes as established by this check.

Changed: `README.md`; `client/src/components/PageHeader.jsx`; `client/src/lib/format.js`; `client/src/pages/Dashboard.jsx`, `Ledger.jsx`, `Products.jsx`, `Sales.jsx`, `Settings.jsx`; `server/middleware/auth.js`; `server/models/Counter.js`, `Customer.js`, `LedgerEntry.js`, `Product.js`, `ReturnRecord.js`, `Sale.js`, `User.js`; `server/routes/auth.js`, `customers.js`, `dashboard.js`, `ledger.js`, `products.js`, `sales.js`, `settings.js`; `server/server.js`; `server/services/invoiceService.js`, `pdfService.js`, `whatsappService.js`; `server/tests/profit.test.js`; `server/utils/profit.js`, `saleMath.js`.

Additional: `BIZZROW_PRODUCTION_READINESS_AUDIT.md`, `MVP_FINAL_RELEASE_REPORT.md`, `MVP_RELEASE_READINESS_REPORT.md`, `package-lock.json`, `.vscode/settings.json`; `client/src/hooks/useFinancialMutation.js`; `client/src/lib/duplicateReview.js`, `duplicateReview.test.js`, `format.test.js`, `invoicePrint.js`, `invoicePrint.test.js`; `server/models/StockAdjustment.js`, `StockBatch.js`; `server/scripts/migrateProductPricing.js`; `server/services/financialTransaction.js`, `invoicePdf.js`, `ledgerStatement.js`, `paymentAllocation.js`, `productDeletion.js`, `stockAdjustment.js`, `stockBatchService.js`, `stockService.js`; `server/tests/billingIntegrity.test.js`, `collectionReconciliation.test.js`, `corsConfig.test.js`, `financialTransaction.integration.test.js`, `financialTransaction.test.js`, `inventoryTransaction.integration.test.js`, `invoicePdf.test.js`, `invoiceTerms.test.js`, `ledgerStatement.test.js`, `paymentAllocation.test.js`, `productDeletion.test.js`, `productDuplicates.test.js`, `productExport.test.js`, `productPricing.test.js`, `resetLinkPolicy.test.js`, `splitPaymentRoute.integration.test.js`, `stockAdjustment.test.js`, `stockBatchService.test.js`, `stockService.test.js`, `tokenVersion.test.js`; `server/utils/collectionReconciliation.js`, `corsConfig.js`, `invoiceTerms.js`, `productDuplicates.js`, `productExport.js`, `productPricing.js`, `resetLinkPolicy.js`, `tokenVersion.js`.

### Remaining release blockers

1. Establish an actual tracked release revision distinct from or deliberately associated with the production-connected branch, review its complete diff, and confirm the promotion and rollback mechanism out of band.
2. Complete the interactive mobile and desktop matrix, real-keyboard and landscape checks, including sale, ledger, returns, replacements and populated analytics.
3. Verify tenant isolation and exact-paise workflow coverage, production-safe configuration, secret handling and the historical-collection policy without exposing credentials or using production records.
4. Review the stock-adjustment API's mandatory idempotency key and reason with all consumers. The local test services and synthetic database are isolated; no production deployment, data change, migration, push or merge was performed.

## Latest QA continuation — thermal correction and additional verification

**Current recommendation: HOLD — VERIFICATION REQUIRED.** The repeatable 58mm layout defect described below was corrected with approval. The complete essential browser and tenant matrix and historical-collection decisions are still outstanding. This section supersedes the earlier interim statuses below, which are retained as a historical record.

### P1: overlapping totals on 58mm thermal PDFs — corrected

Expected: each invoice label and amount is legible and does not overlap another row. Before the fix, the second line of "Items subtotal (after line discounts)" overlapped "Grand total". The downloaded 58mm PDF for disposable invoice BZR-2026-000001 showed this in the browser PDF viewer; the same overlap was independently reproduced with a second, synthetically generated 58mm invoice. The 80mm PDF for BZR-2026-000001 did not show this overlap.

Root cause: `buildThermal` in `server/services/invoicePdf.js` renders labels in a fixed-width column and advances `y` by a fixed single-line height in `rightRow`. PDFKit still wraps when a width is supplied, even with `lineBreak: false`, so a two-line label extends into the following row. The thermal height estimate also assumes a fixed height per summary row.

Approved correction: `server/services/invoicePdf.js` measures both columns in their actual fonts and widths, advances by the larger rendered height and accounts for wrapped rows in the receipt height estimate. `server/tests/invoicePdf.test.js` checks rendered row positions, long item and summary labels, large amounts, both widths and receipt footer bounds. The corrected synthetic 58mm PDF was viewed in the browser PDF viewer; its subtotal and grand total were visibly separate. This visual recheck was of a generated fixture, not a fresh confirmed browser download. No physical printer was tested.

### Collection correction and latest tests

The previously reported replacement collection discrepancy was corrected with approval. New sales retain an immutable original-tender snapshot, and dashboard collections use actual tender and recorded refunds while excluding replacement credit. Historical records missing the snapshot are explicitly flagged as incomplete; no historical amounts were fabricated or migrated. Historic collection breakdowns may still be inaccurate or unreconstructable and require an operational decision before release.

After the thermal correction, the complete backend suite using the isolated MongoDB replica set passed **121 tests, 0 failed, 0 skipped**. The separate financial, inventory and split-payment MongoDB integration run passed **3 tests, 0 failed, 0 skipped**. Frontend tests passed **7 tests, 0 failed, 0 skipped**; the production build passed with a large-chunk warning. The thermal geometry test now verifies row placement; it is not a physical-printer test.

### Latest workflow evidence

Evidence labels: **C** code review; **U** unit tests; **I** isolated integration/API; **B** actual browser; **P** production. These labels indicate the type of evidence actually obtained, not completion of every variant. **P: not performed for all workflows.**

| Workflow | Expected | Actual and evidence |
| --- | --- | --- |
| Authentication | A disposable account can register, log out and log in again. | **B:** registration, logout and login succeeded locally. Invalid login, expiry and production authentication remain unverified. |
| Duplicate review and batch | Correct group, explicit selection and safe deletion, followed by a persisted batch. | **B, I:** two matching zero-stock products appeared as one pair; deletion was disabled before selection, then enabled for the other product. After confirmation the selected product ID remained and the other was absent from the API. A batch of 6 at cost 40 then showed received 6, remaining 6 and aggregate stock 6. Selection persistence across closing the review without deletion was not verified. |
| Retail discount and split tender | 2 x 100, 10% line discount, 20 flat bill discount: total 160, cash 50, UPI 75, due 35. | **I:** matched those values. Earlier split ledger validation defect was fixed and regression-tested. |
| Ledger payment and retry | UPI 35 settles both sale and customer due exactly once. | **I:** both dues became zero; identical-key replay returned the same single ledger entry. Browser settlement not verified. |
| Discounted returns | Partial then remaining full return cannot exceed original 160. | **I:** two returns of 80, total 160. Separate transaction tests cover concurrent returns. Browser discounted return not verified. |
| Wholesale discount and split tender | Accurate discounted totals, payment, due and stock. | **I:** 2 x 80 less 10% bill discount, UPI, total 144. **B:** a separate desktop sale of 2 x 80 with 10% line discount and 4 flat bill discount totaled 140, paid cash 50 and UPI 60, and due 30. The invoice displayed the saved amounts. |
| Desktop ledger settlement and returns | Settle due, then return one unit twice, reconciling invoice, stock and collections. | **B, I:** cash ledger payment 30 reduced customer and invoice due to 0; each discounted return was 70. After the first, invoice net/paid was 70, stock 5 and collections cash 30/UPI 40; after the second, invoice net/paid/due and collections were 0, and stock returned to 6. Stock and collections were checked via the isolated API after browser operations. |
| Even, higher, lower replacements | Credit, additional payment, due and cash refund reconcile. | **I:** isolated API cases matched expected values. Higher replacement and dashboard receipt behavior also have route integration coverage. Browser variants not verified. |
| Deletion safety | Unused zero-stock product deletes; stock or transaction history blocks deletion. | **I:** unused product deleted; stocked and zero-stock sale-history products returned 409. Other history categories have prior unit coverage, not an exhaustive route/browser matrix. |
| Tenant isolation | Account B cannot access or mutate A's resources. | **I:** tested product/batch/adjustment access and mutations, sale, invoice/PDF and ledger/payment returned 404. In a separate two-account test, B's customer list excluded A's customer, B's edit/delete returned 404, A's customer remained unchanged, B's settings edit did not change A's settings, and unauthenticated settings returned 401. All possible paths remain unverified. |
| Invoice downloads | Actual files contain saved values and use selected dimensions. | **B:** pre-fix downloaded A4, 80mm and 58mm PDFs had PDF headers, saved business/item/120.50 content and expected page widths. Browser download events timed out, but files appeared in Downloads. The pre-fix 58mm visual defect was corrected and independently checked on a generated fixture; a new post-fix browser download was not confirmed. Physical printing and broader pagination/terms/adjustment journeys remain unverified. A print-popup automation wait timed out and is not evidence that print preview works or fails. |
| Desktop/mobile | Essential journeys work in both layouts. | **B:** desktop invoice opened; a mobile walk-in retail cash sale completed at 390 x 844, and the invoice table scrolled horizontally. The full requested matrix remains unverified. |
| Stock adjustment contract | Key and reason required; retries do not duplicate writes. | **C, I:** missing key/reason rejected, identical-key retry returned the same adjustment record, and changed body with the same key returned 409. Replay returns current product state, not a byte-identical initial response. Review external consumers of both stock endpoints before release. |

Additional approved QA changes: `server/services/ledgerStatement.js`, `server/routes/ledger.js`, `server/routes/customers.js`, `client/src/lib/format.js`, `server/tests/ledgerStatement.test.js`, and `client/src/lib/format.test.js` preserve and display paise; `server/models/LedgerEntry.js` and `server/routes/sales.js` correct split ledger methods and replacement refund-part propagation; `server/models/Sale.js`, `server/routes/sales.js`, `server/routes/dashboard.js`, `client/src/pages/Dashboard.jsx`, and `server/tests/splitPaymentRoute.integration.test.js` implement and exercise the collection correction; `server/services/invoicePdf.js` and `server/tests/invoicePdf.test.js` correct and test thermal row spacing. `MVP_FINAL_RELEASE_REPORT.md` records this work. The list in the earlier inventory section below describes earlier work, not an exhaustive Git diff; the workspace is untracked in its parent repository.

All runtime data was disposable and isolated in local test databases; production, deployment configuration and Git history were not changed. GST calculation remains out of scope. The requested full authenticated browser matrix, exhaustive tenant isolation, WhatsApp resend, physical printing and production verification remain outstanding. Do not deploy.

## Earlier QA continuation — dashboard collection blocker (historical; resolved as above)

**Current recommendation: HOLD — FIXES / VERIFICATION REQUIRED.** After approval to correct the replacement route exception, testing revealed a repeatable P1 collection-reporting defect. QA has stopped again pending explicit approval and a historical-data policy decision. Results below distinguish this continuation from the preceding verification phase.

### Confirmed P1: replacement removes real tender from dashboard collections

Expected: an original ₹100 collection (₹40 cash and ₹60 UPI), followed by an even return-credit transfer into a ₹150 replacement plus ₹50 UPI and no cash refund, yields ₹150 in actual collections: ₹40 cash and ₹110 UPI. Actual: dashboard today collection changed from ₹100 to ₹50, showing ₹0 cash and ₹50 UPI. Both isolated API attempts, using separate disposable accounts and fixtures, returned the same result. Each replacement recorded ₹100 credit, ₹50 new payment, ₹0 due and ₹0 cash refund. This demonstrates incorrect dashboard reporting, not a proven discrepancy in stored customer due.

Root cause: `computeReturnSettlement` removes the carried tender from the original sale's mutable `payments`; `server/routes/dashboard.js` aggregates those remaining payments and the new replacement's ₹50 tender, while correctly excluding ₹100 replacement credit. The retained sale data no longer contains the original tender breakdown after the full return. `ReturnRecord` does not currently preserve that credited tender breakdown, so it is not safe to invent historical cash/UPI allocations. Ordinary return reporting also combines mutable sale payments and separate refund aggregation; its behavior needs explicit runtime verification, not an assumption.

Proposed approach, **not implemented**: preserve immutable actual-tender collection events with their original method, amount and collection time for new transactions, and calculate dashboard collections from actual receipts and actual refunds rather than transferred replacement credit. Reuse existing records where they preserve sufficient information and cover returns, later ledger payments, replacements, trends and date ranges with integration tests. This requires a carefully scoped design review: historic records whose original split was erased may not be reconstructable. Do not silently backfill or fabricate their method breakdown. Approval is required for both the correction and the treatment of incomplete historic records.

### P1: replacement failed when constructing refund details — corrected

Expected: replacing a ₹100 sale paid ₹40 cash and ₹60 UPI with a ₹150 item and an additional ₹50 UPI succeeds, recording ₹100 replacement credit and ₹50 actual tender. Actual: HTTP 500, `paymentParts is not iterable`, reproduced twice by `server/tests/splitPaymentRoute.integration.test.js` using independent isolated test fixtures. The test stops at that error; the new sale and replacement-ledger assertions are not reached.

Root cause: `computeReturnSettlement` supplies `paidRefundPayments`, but `processReturn` in `server/routes/sales.js` does not include that field in its result. The replacement handler passes the resulting undefined value to `cashRefundParts`, whose `for...of` loop throws even when the cash refund is zero.

Approved correction: `processReturn` now returns `s.paidRefundPayments`, leaving the settlement calculations and transaction boundaries unchanged. The previously failing HTTP integration test passed: replacement credit ₹100, additional UPI ₹50, due ₹0, and a UPI ledger method. Two further independent API attempts also succeeded at the replacement route but exposed the dashboard discrepancy above. Even/lower replacement and refund/rollback cases remain unverified.

### P1: split-tender customer sale failed — correction in progress

Expected: an existing-customer retail sale of ₹100 with ₹40 cash and ₹60 UPI succeeds atomically and records the two actual payment methods. Actual: HTTP 500, `LedgerEntry validation failed: paymentMethod: split is not a valid enum value for path paymentMethod`. This was reproduced twice with independent idempotency keys through the isolated local API. After each failure, the test product remained at 5 units, sale count remained 0, customer due remained 0, and ledger entry count remained 0, confirming rollback for these attempts.

Root cause: `server/routes/sales.js` writes a single payment ledger entry using `summaryMethod`, which is `split` for multiple tenders, but `server/models/LedgerEntry.js` accepts only `cash`, `upi`, `bank`, and `card`. The replacement-sale helper uses the same pattern and also labels a transaction `split` when replacement credit is combined with even one actual tender; this related replacement behavior is code-reviewed but not yet reproduced.

Approved correction: `server/models/LedgerEntry.js` accepts `split`; the replacement helper in `server/routes/sales.js` assigns its payment ledger method from the actual tender rather than replacement credit. `server/tests/splitPaymentRoute.integration.test.js` exercises the HTTP route on an isolated replica set. Its split-sale, replay, stock, ledger-method and dashboard cash/UPI assertions passed before the replacement request failed as described above. Replacement method verification remains blocked; this change is not fully validated.

### Confirmed P1: ledger statement rounds away paise

| Expected | Actual | Evidence |
| --- | --- | --- |
| A sale for ₹100.50 with a ₹10.25 cash payment leaves ₹90.25 outstanding. Ledger statement running and closing balances should retain the same paise. | Sale due and customer pending balance were ₹90.25; the statement returned a first running balance of ₹101 and a closing balance of ₹90. Ledger entries retained the correct ₹100.50 and −₹10.25 amounts. | Reproduced twice with separate disposable customers and sales through the isolated local API. Both attempts yielded the same values. |

Root cause: `computeStatement` in `server/routes/ledger.js` used `Math.round` for opening, running and closing balances, rounding to whole rupees. Both the JSON statement and PDF statement routes call this function. The observed discrepancy was in statement output; the test did not show corruption of stored sale, customer, or ledger entry values.

Approved correction: statement balances now use the existing `round2` helper; the customer pending summary retains paise, and shared frontend currency formatting displays up to two fractional digits while keeping whole amounts unchanged. A new ledger statement test checks opening, running and closing values and generated PDF content; a frontend formatting test checks fractional and whole values. Isolated API re-test confirmed a ₹100.50 sale, ₹10.25 cash, ₹90.25 statement/customer summary and a ₹90.25 UPI settlement reducing the customer and sale due to zero. Changed files: `server/routes/ledger.js`, `server/routes/customers.js`, `server/services/ledgerStatement.js`, `server/tests/ledgerStatement.test.js`, `client/src/lib/format.js`, and `client/src/lib/format.test.js`. Dashboard aggregate rounding was identified by code inspection but has not been reproduced or changed.

### Stock adjustment review

Code review confirms that `PATCH /products/:id/stock` and `POST /products/:id/stock-adjustments` share the same handler, require an 8–200 character idempotency key and a non-empty reason of up to 500 characters, and use an owner-scoped transaction. The new reason and key requirements change the previous PATCH contract; all external and frontend consumers must be identified and updated before release. Replay uses the original adjustment record but returns the current product state, so a replay after later stock activity is not a byte-identical original response. This is code-review evidence, not a new route-level replay test.

### QA continuation status

| Workflow | Expected | Actual / evidence |
| --- | --- | --- |
| Fractional retail cash sale and customer balance | Sale and balance preserve paise. | Two isolated API sales returned ₹100.50 total, ₹10.25 paid and ₹90.25 due; customer balances also returned ₹90.25. |
| Fractional ledger statement | Opening, running and closing values match ledger amounts to paise. | Initially **FAIL**, reproduced twice; after approved correction, isolated API and focused unit/PDF tests passed. |
| Ledger payment settlement | Payment updates the sale, customer balance and ledger consistently. | Isolated API: ₹90.25 UPI settlement reduced both balances to zero and recorded ₹100.50 paid. Browser journey remains unverified. |
| Retail/wholesale discounts, UPI/split payments | Accurate saved totals and tender. | Customer split payment initially failed twice; after correction the route integration test passed split-sale, replay and dashboard checks, then failed on the replacement route. Other requested combinations remain unverified. |
| Partial/full returns and even/higher/lower replacements | Correct settlement and inventory restoration. | Higher-value replacement initially failed twice; after correction it succeeded in three isolated attempts, but dashboard collections failed twice. Other requested cases not run in this continuation. Previous full-return evidence remains below. |
| Deletion, two-account isolation, PDF download, thermal output, mobile and desktop | Pass the requested complete workflow matrix. | Not run in this continuation; earlier partial evidence remains below. |
| Full backend, MongoDB integrations, frontend tests and build | All pass following an approved correction. | After the replacement exception correction: **120 passed, 0 failed, 0 skipped** backend tests including replica-set integrations; frontend: 7 passed, 0 failed, 0 skipped; build passed with a large-chunk warning. The newly observed dashboard discrepancy was found afterward and is not covered by that passing suite. |

The reproduction used the loopback-bound local replica set and `bizzrow_browser_test`, with disposable synthetic account, product, customer and sale data. External-provider credentials were disabled for the isolated process. Synthetic records remain in that test database; no production data, production configuration or Git history was changed. No deployment was performed.

Await explicit approval and a historical-data decision before changing application code or continuing beyond the dashboard defect. After an approved fix, rerun the complete backend suite, replica-set integration tests, frontend tests and production build, then finish the requested QA matrix.

## Executive decision

**HOLD — FIXES / VERIFICATION REQUIRED.** This is not a production sign-off. The isolated automated tests pass and a limited local browser journey passed, but the required end-to-end sales, payments, replacements, tenant isolation, invoice printing, and mobile/desktop matrix is incomplete. An attempted browser PDF download received an HTTP 200 response but the browser harness did not emit a download event before timeout; delivery of the downloaded file is not verified. Do not deploy.

No production data, deployment configuration, migrations, or Git history was modified. GST calculation remains outside the MVP; invoices must not invent tax when it was not saved.

## Findings and changes

| Severity | Finding | Status |
| --- | --- | --- |
| P1 | Sale and replacement creation referenced business settings from the wrong scope. Multi-document ledger creation with a session lacked the Mongoose `ordered` option. | Fixed earlier in this work; local retail sale with a cash payment completed. Replacement route still needs end-to-end verification. |
| P1 | There was no visible, audited way to correct a specified stock source. The old stock patch lacked an audit trail and retry protection. | Implemented transactional, idempotent corrections and a limited local browser check. Wider route, concurrency, and workflow verification remains necessary. |
| P1 | Opening/legacy stock and dated batches needed an explicit consumption policy; previous behavior consumed dated batches before legacy stock. | With the owner's decision, new sales consume legacy stock first, then dated batches in FIFO order. Per-line snapshots preserve return allocation; historical items retain their previous batch-first interpretation. Broader regression verification remains necessary. |
| P1 verification gap | Essential browser journeys, multi-tenant mutation checks, and invoice/print delivery are incomplete. | HOLD pending the matrix below; this is a verification gap, not a claim that each workflow is broken. |
| P2 | Adjustment history shows at most the latest 100 entries and explicitly indicates when older records exist; batch reversal calculation reads the selected batch's adjustment history without pagination. | Older records remain stored; assess pagination and query performance before large-scale use. No new database index was added. |
| P2 | Frontend build warns about a bundle larger than 500 kB. | Deferred; build succeeds. |

### Inventory rules and API compatibility

- A correction explicitly selects legacy stock or a particular batch and requires a nonzero signed quantity and a reason. The aggregate product stock, chosen source, and audit record are written in one MongoDB transaction. Neither source can go negative.
- Positive batch corrections are limited to reversing net previously recorded reductions and cannot exceed the received quantity. New purchases use a new batch. This is intended to preserve capacity for returns rather than inventing purchase history.
- Both `POST /api/products/:id/stock-adjustments` and the existing `PATCH /api/products/:id/stock` now require an `Idempotency-Key` and a reason in addition to numeric `delta`; optional `batchId` selects a batch. This is an intentional compatibility change: callers of the old PATCH must be updated before deployment. An uncertain request should be retried with the same key and identical body; inspect current stock and history before discarding it.
- `GET /api/products/:id/stock-adjustments` returns `adjustments` and `hasMore` for the latest 100 records. Deletion remains blocked for nonzero stock and sale, return, replacement, batch, or stock-adjustment history; no historical records are cascaded.
- No historical stock or sale records were migrated. Floating-point fractional quantities and complex sequences of adjustments and returns require additional targeted testing before relying on them operationally.

## Files changed in the work described here

The workspace is not an independent Git repository: Git resolves to the parent user directory, and the workspace was untracked there. Therefore a reliable repository diff and exhaustive attribution of all pre-existing workspace changes are unavailable. The following are the files identified as changed in the current inventory work and the preceding explicitly requested sale/integration corrections:

- `server/routes/sales.js` — business setting scope and ordered session ledger inserts.
- `server/tests/financialTransaction.integration.test.js` — sold-count delta assertion and ordered multi-ledger rollback check.
- `server/models/Sale.js` — legacy-first allocation snapshot.
- `server/models/StockAdjustment.js` — adjustment audit record.
- `server/services/stockService.js` and `server/services/stockBatchService.js` — legacy-first allocation and return restoration.
- `server/services/stockAdjustment.js` — transactional source-specific corrections.
- `server/services/productDeletion.js` and `server/routes/products.js` — audit-history deletion protection and adjustment API.
- `server/utils/profit.js` — cost calculation after legacy-first returns.
- `server/tests/stockBatchService.test.js`, `server/tests/profit.test.js`, `server/tests/productDeletion.test.js`, `server/tests/stockAdjustment.test.js`, and `server/tests/inventoryTransaction.integration.test.js` — inventory regression coverage.
- `client/src/pages/Products.jsx` — stock-correction form, audit history, and retry guidance.
- `MVP_FINAL_RELEASE_REPORT.md` — this report.

This list is not a claim that other pre-existing workspace files were unchanged during earlier sprints.

## Test evidence

| Test | Result |
| --- | --- |
| Complete backend `node --test tests\\*.test.js` with isolated replica-set URI | 118 passed, 0 failed, 0 skipped. |
| Separate financial and inventory MongoDB transaction integration tests | 2 passed, 0 failed, 0 skipped. |
| Backend suite without integration URI | 116 passed, 0 failed, 2 skipped; the skipped integrations were subsequently run successfully as above. |
| Focused inventory tests | 35 passed, 0 failed, 0 skipped. |
| Frontend unit tests | 6 passed, 0 failed, 0 skipped. |
| Frontend production build | Passed with large-chunk warning. |
| Syntax checks for sales route, products route, stock adjustment service | Passed. |

MongoDB tests used the loopback-bound `mongo:7` single-node `rs0` container and `bizzrow_financial_test`, with fixture-specific cleanup. They exercised rollback, concurrent overselling and returns, same-key replay, multiple ledger inserts, legacy-first and multi-batch allocation, origin restoration, adjustment rollback, and a cross-owner adjustment rejection. These are service-level integration tests, not complete route-level end-to-end tests.

## Workflow verification matrix

Evidence labels: **C** = code reviewed, **U** = unit tested, **I** = isolated integration/API exercised, **B** = browser exercised, **P** = production verified. An omitted label means not verified at that level. All production verification is **not performed**.

| Workflow | Evidence and observed result | Remaining work |
| --- | --- | --- |
| Registration and dashboard | C, B: a new local account registered and dashboard requests returned 200. | Login, logout, invalid login, expiry, reset, desktop/mobile matrix not verified in this run. |
| Product creation and batch receipt | C, U, I, B: a test product and batch were created; aggregate rose from 5 to 9. | Batch retry and multiple batches in browser not verified. |
| Corrections and reconciliation | C, U, I, B: legacy +5 and batch -1 yielded aggregate 8, batch 3, legacy 5; audit entries were visible. Same-key concurrent correction and rollback passed service integration. | Test fractional quantities, more failure/race cases, and route-level replay. |
| Retail cash sale and full return | C, U, I, B: six units sold, consuming five legacy and one batch; aggregate 8 to 2, batch 3 to 2. Full return restored aggregate 8 and batch 3; invoice showed returned amount 30, net/paid/due 0. | Discounted, partial, concurrent route returns and replacements in browser remain unverified. |
| Multi-batch FIFO and restoration | C, U, I: service test consumed legacy then two dated batches and restored original allocation. | Actual multi-batch route and browser workflow remain unverified. |
| Deletion safeguards | C, U, B: attempting to delete a stocked test product returned HTTP 409 and it remained visible. Unit tests cover zero stock and historical references, including adjustments. | Additional browser cases and concurrent route behavior remain unverified. |
| Wholesale, discounts, split/credit, ledger payments, refunds and replacement | C, U; transaction-related service integration provides partial evidence. | Full authenticated browser and route-level verification not run. |
| Invoice | C, U, B: local retail invoice showed saved line, payment, due, terms, and later return adjustment. A4 PDF endpoint returned HTTP 200 after clicking download. | Download event timed out in the test harness; actual file delivery not verified. Thermal formats, pagination, browser print, later ledger payment, historical stability, and WhatsApp resend not verified end-to-end here. No physical printer test. |
| Duplicate review, product edit and export | C; duplicate normalization has U coverage. | Actual duplicate selection/deletion, edit, and export browser workflows not verified. |
| Tenant isolation | C, I: a second local account received 404 for the first account's batch and correction history, sale, invoice and PDF; unauthenticated products request returned 401. | Cross-tenant writes, customers, ledger, settings, and broader authorization/expiry behavior not verified. |

The isolated browser test used a separately started loopback API and frontend with a fresh local test account and synthetic product/sale data in `bizzrow_browser_test`. The API used the local replica set and a temporary local signing key; WhatsApp, AI and SMTP credentials were disabled. Existing listeners on the standard development ports were not trusted or used for writes. Synthetic browser records remain in that test database; no whole database or volume was deleted.

## Focused security and performance review

- Product, batch, correction and sale lookups examined in the tested paths use owner scoping; the negative tests above are narrow and do not establish complete tenant isolation.
- Protected products returned 401 without authentication. Production JWT expiration, password reset and credential/log handling need dedicated verification. Do not expose local logs, tokens, or credentials in release evidence.
- The financial transaction helper fails explicitly if MongoDB lacks transaction support. The integration environment used a replica set. Production topology and privileges have not been verified.
- Idempotency uses an owner, operation and key identity plus a request fingerprint. Existing pending browser requests must not be discarded without checking the outcome.
- CORS and external-provider configuration were reviewed for the local test setup only; production values were neither read nor verified.
- Adjustment history is bounded in the response, but reversal lookup is currently unbounded. Review indexes and query plans without modifying production indexes during this task.

## Phase status

1. Repository/release-state audit: completed to the extent described; independent Git diff unavailable.
2. Inventory lifecycle audit: code and selected tests reviewed; complex sequences remain outstanding.
3. Inventory corrections and regression tests: implemented and tested as above; compatibility review required.
4. Financial and sales verification: automated coverage passed; browser matrix incomplete.
5. Invoices and ledger: limited browser invoice and unit checks; print/download and ledger journeys incomplete.
6. Authentication/tenant isolation: limited registration and cross-tenant read checks; not comprehensive.
7. Browser testing: partial only; no desktop/mobile coverage claim.
8. Regression/build: completed as listed.
9. Security/performance review: focused and partial; not a penetration test or production audit.
10. Report: complete; **sign-off withheld**. No next feature sprint or deployment has been started.

## Release prerequisites, backup and rollback

1. Complete every missing P1 workflow in the matrix on isolated staging with two test tenants; verify both mobile and desktop, actual printable output, and invoice download. Investigate the download-event timeout rather than treating HTTP 200 as successful delivery.
2. Review and approve the stock policy and PATCH compatibility change with API consumers. Test fractional quantities and historical return sequences; resolve any confirmed P1 defects and rerun full suites.
3. Verify staging and production MongoDB replica-set transaction support, least-privilege access, tenant boundaries, environment secrets, external-provider and CORS configuration without exposing credentials. Obtain explicit deployment approval.
4. Before any approved deployment, take and validate a restorable, timestamped database backup or point-in-time recovery snapshot; record recovery point, retention, access, and restoration owner. Rehearse restoration in an isolated environment. No backup or restore was performed here.
5. Preserve identifiers of the current application artifacts and deployment settings. If rollout fails, stop further rollout, revert application artifacts using the hosting platform's approved rollback process, and monitor errors, transaction failures, balances and stock. Restoring a database can discard subsequent legitimate writes: coordinate maintenance and reconcile from a verified backup and transaction records; do not blindly restore or run migrations.

**Final recommendation: HOLD — FIXES / VERIFICATION REQUIRED.**
