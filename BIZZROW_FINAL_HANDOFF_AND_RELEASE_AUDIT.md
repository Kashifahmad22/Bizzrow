# BIZZROW — FINAL HANDOFF AND RELEASE AUDIT

Generated: 2026-11-12 · Release branch: `release/bizzrow-v1.0` · Repository: https://github.com/Kashifahmad22/Bizzrow

This document is self-contained: it allows a developer or AI model on any device to continue Bizzrow development without prior conversation context.

---

## A. Executive summary

- **What Bizzrow is:** a production SaaS for Indian retail + wholesale businesses: product/inventory management, retail & wholesale billing, GST-inclusive pricing, Tatkal (on-the-spot) product addition during sales, customer ledger, returns/replacements, inventory audits, PDF/thermal invoices, WhatsApp invoice delivery, AI insights and OCR product import.
- **Who it serves:** small/medium Indian shops selling both retail and wholesale.
- **Status:** live in production. Backend verified live on Render; frontend on Vercel (currently one release behind — see §L).
- **Release line:** v1.0 baseline → v1.1 pricing engine → v1.2 search/performance → **v1.3 (this sprint): invoice pagination + GST breakdown + PDF rate limiting**.
- **Recommendation: READY WITH KNOWN LIMITATIONS** — all tests green (187 server / 28 client / 21 e2e, zero skipped), but the Vercel frontend requires a manual deploy and GST compliance reporting (GSTR-1/3B, CGST/SGST split) is not implemented (see §E, §K).

## B. Technology and architecture

| Layer | Stack | Location |
|---|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3, react-router 6, axios, recharts (lazy), framer-motion | `client/` |
| Backend | Node.js (CommonJS) + Express 4 + Mongoose 8, pdfkit, JWT (jsonwebtoken), nodemailer, @google/genai | `server/` |
| Database | MongoDB Atlas (replica set; transactions required) | `server/config/db.js` |
| Auth | JWT bearer tokens, token-version revocation (`RevokedSession`), per-owner tenant scoping on every query | `server/middleware/auth.js` |
| Hosting | Backend: Render (`https://bizzrow.onrender.com/api`) · Frontend: Vercel (`https://www.bizzrow.com`, also `bizzrow.vercel.app`) | — |

**Environment variables (names only):** `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, `PORT`, `GEMINI_API_KEY`, `SMTP_*`, `NODE_ENV`, `RATE_LIMIT_{AUTH,RECOVERY,SEARCH,DASHBOARD,EXTERNAL,PDF}_{MAX,WINDOW_MS}`; client: `VITE_API_URL`.

**Major modules:**
- Pricing engine: `server/utils/productPricing.js` (+ client mirror `client/src/lib/pricing.js`)
- GST invoice summary: `server/utils/invoiceTax.js` (+ mirror inside `client/src/lib/invoicePrint.js`)
- Financial transactions & idempotency: `server/services/financialTransaction.js`
- Invoice PDFs (A4 paginated + thermal 80/58 mm): `server/services/invoicePdf.js`; browser print HTML: `client/src/lib/invoicePrint.js`
- Invoice numbering (per owner+year, atomic): `server/services/invoiceService.js`
- Product search cache: `client/src/lib/productCache.js`; server search: `server/utils/search.js`
- Sales workflow: `server/routes/sales.js`, `client/src/pages/Sales.jsx`
- Inventory audits: `server/routes/inventoryAudits.js`, stock: `server/services/stock*.js`
- Rate limits: `server/middleware/rateLimit.js` wired in `server/server.js`

## C. Product functionality matrix

| Module | Implemented | Tested | Production verified | Remaining work |
|---|---|---|---|---|
| Auth + tenant isolation | ✅ | ✅ (unit+integration+e2e) | ✅ (live smoke) | — |
| Product CRUD + OCR import | ✅ | ✅ | ✅ | OCR drafts prefill wholesale from cost (user-reviewed) |
| Retail/wholesale pricing (2× default, overrides) | ✅ v1.1 | ✅ | ✅ (live smoke 9/9) | — |
| Tatkal product addition | ✅ v1.1 | ✅ incl. idempotent retry e2e | ✅ | — |
| Product search + cache + refresh | ✅ v1.2 | ✅ | ✅ (payload −99.4% measured) | — |
| Sales, discounts, split payments, cash tender | ✅ | ✅ | ✅ | — |
| Returns & replacements | ✅ | ✅ | backend verified | — |
| Customer ledger & reminders | ✅ | ✅ | backend verified | — |
| Inventory audits | ✅ | ✅ | ✅ | — |
| Invoice PDF (A4 multi-page, thermal) | ✅ this sprint | ✅ (12 PDF tests incl. pagination matrix) | ⏳ needs deploy | visual spot-check post-deploy |
| GST breakdown on invoices | ✅ this sprint (new sales) | ✅ (5 unit + print tests) | ⏳ needs deploy | CGST/SGST split (see §E) |
| Dashboard & analytics | ✅ | partial | ✅ loads | visual polish deferred (P3) |
| WhatsApp / AI insights | ✅ | partial | ✅ reachable | external-API dependent |
| Settings (terms, bank, logo, GSTIN) | ✅ | ✅ | ✅ | — |

## D. Development history (verified commits on `release/bizzrow-v1.0`)

| Commit | Release | Content |
|---|---|---|
| `841e000` | v1.0 | production baseline |
| `256714b`…`88f0b1c` | v1.0.x | cash tender, financial precision, e2e coverage, security + inventory audit sprints |
| `3c47394` | — | Tatkal product creation + inventory audit coverage (last pre-v1.1 deploy) |
| `36094e6` | **v1.1** | GST-inclusive pricing engine: 2× retail default, `retailPriceOverridden` flag, Tatkal wholesale/retail/GST form, `gstBreakdown` utility |
| `4e54d56` | **v1.2** | `fields=lite` payloads, product cache + refresh buttons, route code splitting, audit badges |
| this sprint | **v1.3** | A4 invoice pagination (headers/footers/page numbers), GST invoice summary from `gstPct` snapshots, bigger logo, multi-page browser print, PDF rate limit |

Merges `8251e71` (v1.1) and `71dfe48` (v1.2) exist on `main` (deployment branch). `CHANGELOG.md` holds detailed notes.

## E. GST completion report

**Implemented and tested:**
- Product-level `gstPct` (0–100, default 0; editable in product + Tatkal forms).
- GST-inclusive selling prices everywhere: GST = inclusive × rate ÷ (100 + rate) (`productPricing.gstBreakdown`, `invoiceTax.gstSummary`); **GST is never added on top** — enforced by tests (`productPricing.test.js`, `invoiceTax.test.js`, `invoicePdf.test.js`, `invoicePrint.test.js`).
- Per-item `gstPct` **snapshot at sale time** (new, `Sale.items[].gstPct`, null on legacy items) so product edits never change historical invoices.
- Invoice GST summary (PDF + browser print): per-rate taxable value and included GST, mixed rates grouped, bill discounts allocated proportionally; totals unchanged. Appears only when snapshots exist — legacy invoices render exactly as before.
- Business GSTIN (settings → invoice header) and customer GSTIN snapshot on invoices.
- Discount tax treatment: GST extracted from post-discount inclusive amounts.

**Partially implemented:** HSN captured on products but not printed on invoice line items.

**Not implemented (do not claim GST compliance):**
- CGST/SGST vs IGST split — **blocked on data**: no state / place-of-supply fields exist. Requires a product/business decision.
- Bill of supply, credit/debit notes as GST documents, GST sales reports, tax-period summaries, GSTR-1 / GSTR-3B preparation or export.
- Compliance review of invoice fields by an accountant (**requires legal/accounting validation**).

**Honest assessment:** calculation layer for inclusive GST is complete and tested; compliance/reporting layer is not started. No percentage is quoted because the remaining scope (reporting, place of supply) is undefined.

## F. Financial correctness

- Wholesale (GST-inclusive) is the base price; retail defaults to exactly 2× (`defaultRetailPrice`); manual retail overrides tracked via `Product.retailPriceOverridden` (null = legacy → conservative heuristic, manual prices never silently overwritten); restore-to-2× clears the override. All verified by unit + integration tests and production smoke tests (v1.1).
- Sales compute prices server-side (`salePrice(product, saleType)`); client values are display-only. Invariant enforced across suite: `total − returnedAmount == amountPaid + dueAmount`.
- Stock deducted exactly once per sale under MongoDB transactions with idempotency keys; retries replay, never duplicate (unit, integration and browser e2e coverage including lost-response retry).
- Historical snapshots (names, prices, costs, terms, now gstPct) are immutable; verified in integration tests and live smoke.
- Cost price independent of selling price; unknown cost ⇒ no margin reported (never fabricated).
- Unverified: multi-year invoice-counter rollover has unit coverage only; WhatsApp delivery depends on an external API.

## G. Invoice and PDF specification

- **Architecture:** server-side pdfkit (`invoicePdf.js`) for downloads (A4 / thermal80 / thermal58); client-side HTML+CSS (`invoicePrint.js`) for browser printing. Both consume the same sale/business data and render consistent content.
- **A4:** 595.28×841.89 pt, margins via fixed 40/555 pt gutters, content bottom reserved at `height − 60` for the footer band.
- **Header:** dynamic business profile (logo fit 74×60 pt aspect-preserved, name, address, phone/email, GSTIN, UPI) + invoice number/date/sale type — **repeated on every page**.
- **Footer:** contact line + **dynamic `Page N of M`** stamped via pdfkit buffered pages on every page.
- **Items table:** heading repeated per page; rows never split; long names wrap; totals follow the last item.
- **Totals/bank details:** side-by-side when they fit (keeps small invoices on one page), otherwise flow with page breaks.
- **Terms and conditions:** per-business editable in Settings, snapshotted per sale (`invoiceTermsSnapshot`); rendered once as a keep-together block that moves whole to the next page when needed; never repeated, never split (unless alone exceeding a full page).
- **One-page preference:** 1–5 item invoices fit one page (test-asserted); 15/30/80 items paginate (2+ pages) instead of failing — previously the server **rejected** oversized invoices and the browser refused to print them.
- **Known limitations:** no HSN column; built-in Helvetica may not render all Indic scripts (₹ replaced by "Rs."); browser print leaves header repetition to the browser (only the table heading repeats via CSS).

## H. Performance report (measured values unless noted)

| Metric | Before | After | When |
|---|---|---|---|
| Initial JS bundle | 1,057.7 kB (303.5 kB gzip) | **374.8 kB (125.3 kB gzip)** | v1.2 code splitting |
| Product search payload (1 image product) | 96,607 B | **574 B** (`fields=lite`) | v1.2, measured on production |
| Median production search latency | 1,650 ms | **1,050 ms** (network-bound floor) | v1.2, measured on production |
| Repeat search (client cache, 30 s TTL) | full refetch | **0 network** | v1.2 |
| PDF generation (local) | — | 24–133 ms for 1–30 items, 2.8–6.0 KB | v1.3, measured |

- Caching: `productCache.js` (30 s TTL, 50 entries, version invalidation on every product/stock mutation incl. sales, returns, audit approvals); module-level and cleared on reload — single-user browser context, logout reloads the app. Checkout never uses cached values.
- Lazy loading: all routed pages via React.lazy; recharts ships only with Dashboard/AI.
- Rate limits (per IP, in-memory, env-overridable): AUTH 30/15 min, RECOVERY 10/15 min, SEARCH 300/min, DASHBOARD 120/min, EXTERNAL 30/min, **PDF 60/min (new)** — generous for legitimate use; 429 + Retry-After on breach.
- Hosting bottleneck (estimate, documented v1.2): ~1 s latency floor from India↔Render region RTT/tier; code cannot reduce it further.

## I. Testing report

Commands (from repo root):
- Server: `cd server; node --test "tests/*.test.js"` — integration tests need `FINANCIAL_TEST_MONGO_URI` (loopback single-node replica set, db `bizzrow_test`, `directConnection=true&replicaSet=…`); easiest: `cd client; node e2e/run.cjs --backend` (disposable Docker mongo:7).
- Client unit: `cd client; node --test "src/**/*.test.js"`
- Browser e2e: `cd client; npm run test:e2e` (Docker + local Chrome/Edge)
- Builds: `cd client; npm run build` · `cd server; npm run build`

Results this sprint: **server 187/187 pass, 0 skipped** (incl. 5 new GST-summary tests, 12 invoice-PDF tests with the new pagination matrix) · **client 28/28** · **e2e 21/21** · both builds pass · `git diff --check` clean. No pre-existing failures. Not covered by automation: visual PDF inspection on production, WhatsApp delivery, physical thermal printers.

## J. Security and reliability

- JWT auth with token versioning and revoked-session checks; all queries owner-scoped (`owner: req.user._id`) — tenant isolation covered by integration and e2e tests (cross-tenant access returns 404/400).
- Input validation: currency precision (paise-exact), quantity validation, strict Tatkal field allow-list, regex-escaped search, OCR import is extraction-only (DB writes only on reviewed commit).
- Idempotency keys + Mongo transactions on all financial mutations; replay protection verified under simulated network loss.
- Rate limiting as §H; CORS locked to configured client origin (tested in `corsConfig.test.js`).
- No secrets in the repository; logos stored as validated base64 data URLs (PNG/JPEG only).
- Risks: in-memory rate limits reset per instance (fine for single Render instance); base64 images inflate default product payloads (mitigated by `fields=lite`); `express.json` 8 MB limit bounds upload abuse.

## K. Known issues and roadmap

- **P0:** none known.
- **P1:** Vercel frontend one release behind — manual deploy required (§L). GST place-of-supply decision needed before any CGST/SGST display.
- **P2:** search latency floor hosting-bound (consider closer Render region/tier); HSN not printed on invoice lines; Indic-script fonts in PDFs unvalidated.
- **P3:** dashboard/ledger visual polish; OCR import prefills wholesale from supplier cost (user-reviewed draft); image storage could move from base64 to object storage.
- **Enhancements (not defects):** GST reports/GSTR exports, credit/debit notes, supplier module, multi-user roles.

## L. Deployment status (as verified 2026-11-12)

- GitHub `release/bizzrow-v1.0`: this sprint's commit (see `git log -1`) — **source of truth**.
- GitHub `main`: `71dfe48` (v1.2) — deployment branch; **does not yet include this sprint** (merging to main was explicitly out of scope for this sprint).
- **Render backend:** live at `https://bizzrow.onrender.com/api`, verified running **v1.2** (lite-fields behavior confirmed in production). Deploys from `main` → to ship v1.3, the owner must merge `release/bizzrow-v1.0` → `main` (previous releases used GitHub PRs) and let Render auto-deploy.
- **Vercel frontend:** `https://www.bizzrow.com` serves a **pre-v1.1 bundle** (`index-B8-G_K4W.js`); Git auto-deploy is not functioning and the owning Vercel account is not accessible from this machine. **Required manual step:** from the owning account, redeploy latest `main` (dashboard) or run `vercel --prod` in `client/` — this ships v1.1 + v1.2 + v1.3 frontends at once.
- Post-deploy smoke checklist: login → product search + refresh → Tatkal create → retail & wholesale sale → invoice PDF (1-item and 15-item) → audit flow → mobile layout.

## M. Handoff instructions

- Working directory: `C:\Users\kashi.ASUS\OneDrive\Desktop\Bizzrow-v1-clean` · Repo: `https://github.com/Kashifahmad22/Bizzrow` · Branch: `release/bizzrow-v1.0`.
- Start backend: `cd server; npm install; npm run dev` (needs `server/.env` with `MONGO_URI`, `JWT_SECRET`).
- Start frontend: `cd client; npm install; npm run dev` (uses `VITE_API_URL`, defaults to the local API).
- Tests/builds: see §I. Never report skipped integration tests as passing — they skip silently without `FINANCIAL_TEST_MONGO_URI`.
- Deployment: push → owner merges release → `main` (PR) → Render auto-deploys; Vercel is a manual deploy from the owning account.
- Key files: pricing `server/utils/productPricing.js`; invoices `server/services/invoicePdf.js` + `client/src/lib/invoicePrint.js`; GST `server/utils/invoiceTax.js`; transactions `server/services/financialTransaction.js`; cache `client/src/lib/productCache.js`.
- **Recommended first task:** deploy the frontend (Vercel) and backend (merge to main), run the §L smoke checklist, then decide the GST place-of-supply model to unlock CGST/SGST display and GST reporting.
