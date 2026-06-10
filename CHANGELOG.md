# Bizzrow — Changelog

## Landing Page — Final Release (Conversion-Focused Launch)

Premium, trust-first marketing site + unified auth, built to the standard of Stripe / Linear / Mercury. Not a redesign of the app — a launch release focused on conversion, professionalism and brand consistency.

### Brand system (from the official logo)
- Brand colours sampled directly from the supplied logo: **navy `#080f21`** and **azure `#1a74f9`**. Added as `navy` + `azure` Tailwind ramps (static; marketing/auth are always dark). The app's existing ramp is untouched.
- The **real logo** is used everywhere — navbar, footer, login, signup, forgot/reset, favicon and social preview. The mark was cropped from the supplied asset (never recreated) into `public/brand/` and used to generate `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png` and a branded 1200×630 `og-image.png`.
- New `BrandLogo` component (mark + typographic wordmark) shared across the site and auth.

### Landing page (`Landing.jsx`, full rebuild)
Sticky glass navbar (Features · Solutions · Pricing · FAQ · Contact + Login / Start Free) → Hero (headline + sub + Start Free / Book Demo) → industry strip → Problem ("less manual work") → Features → Solutions → **OCR workflow** (Upload → Gemini → Review → Margin → Ready) → **WhatsApp** (real mobile + in-app screenshots) → **AI / Business Health** (real dashboard + action insights) → **Product tour** (tabbed real screenshots, PWA note) → **Pricing** (Starter ₹299 / Growth ₹399 *Most Popular* / Business ₹499, monthly⇄annual −20% toggle) → Trust ("built from real feedback", no fake metrics) → FAQ (8, accordion) → Final CTA → Contact (phone + email).
- **Book Demo / Contact Sales** open the user's email client with subject + body pre-filled — no scheduling tool, no payment gateway. Phone `+91 7858057383`, email `hello@bizzrow.com`.
- **Honest media:** only real product screenshots are used. OCR is shown as a styled workflow (no fake screenshot), and there are no invented testimonials or customer counts.

### Unified auth (Login / Signup / Forgot / Reset)
- New shared `AuthLayout` (split-screen brand panel + form) so auth feels native to the marketing site — same navy/azure palette, typography, buttons, cards and logo. Shared `authField` / `authPrimaryBtn` styles. Logic and routes unchanged.

### New pages & routes
- `/privacy` and `/terms` (plain-language, truthful summaries) via a shared `LegalPage` shell, so footer legal links work.

### SEO / meta
- Favicon + apple-touch icons now use the real logo; `og:image`/`twitter:image` point to the branded `og-image.png` (with dimensions); `theme-color` set to navy. Existing SEO meta, keywords and JSON-LD retained.

### Notes
- Validated with esbuild (parse + full module-graph resolution) and a headless-Chrome render against the **real compiled Tailwind CSS**. The npm registry is blocked in this environment, so a `vite build` should be run locally before deploy.

## Launch Candidate — Financial Integrity, Production Hardening & Final Stability

> **Mandate:** Bizzrow is financial software. No new features this sprint — every operation must keep **Inventory · Revenue · Profit · Collections · Outstanding · Ledger · Analytics · Business Health** internally consistent. *A missing feature is acceptable. A wrong financial number is not.*

### The invariant we enforce everywhere

For every sale, at all times:

```
total − returnedAmount  ==  amountPaid + dueAmount
```

Money math now lives in one pure, unit-tested engine (`server/utils/saleMath.js`) so historical invoices stay stable and every code path settles the same way.

---

### 1. Transaction Impact Matrix

What each operation touches. ✅ = updated correctly & consistently after this sprint.

| Operation | Inventory | Revenue (net) | Profit | Collected | Outstanding / Ledger | Analytics | Health |
|---|---|---|---|---|---|---|---|
| **Sale — walk-in (paid)** | −qty ✅ | +total ✅ | +margin ✅ | +paid ✅ | n/a (no ledger) ✅ | ✅ | ✅ |
| **Sale — registered (full/partial/credit)** | −qty ✅ | +total ✅ | +margin ✅ | +paid ✅ | +due, ledger sale+payment ✅ | ✅ | ✅ |
| **Return — walk-in (was paid)** | +qty ✅ | −refund ✅ | −margin ✅ | **−cashRefund ✅ (FIXED)** | n/a ✅ | ✅ | ✅ |
| **Return — registered, fully paid** | +qty ✅ | −refund ✅ | −margin ✅ | −cashRefund ✅ | balance unchanged, no phantom ledger credit ✅ | ✅ | ✅ |
| **Return — registered, partly paid** | +qty ✅ | −refund ✅ | −margin ✅ | unchanged ✅ | −dueReduction, ledger −dueReduction ✅ | ✅ | ✅ |
| **Replacement — same value** | swap ✅ | net swap ✅ | ✅ | credit carries, **due 0 ✅ (FIXED)** | balance unchanged ✅ | ✅ | ✅ |
| **Replacement — higher value** | swap ✅ | net swap ✅ | ✅ | credit + difference ✅ | customer pays difference only ✅ | ✅ | ✅ |
| **Replacement — lower value** | swap ✅ | net swap ✅ | ✅ | credit, **excess refunded as cash ✅ (FIXED)** | balance unchanged ✅ | ✅ | ✅ |
| **OCR invoice import** | only on explicit **commit** ✅ | n/a | n/a | n/a | n/a | n/a | n/a |

---

### 2. Bugs Found → Fixed (financial)

**BUG #1 — CRITICAL: Return updated inventory but NOT collected amount.**
*Symptom (reported):* Sale ₹1000, Collected ₹1000, Return ₹500 → Collected stayed ₹1000.
*Root cause:* `processReturn` restocked and bumped `returnedAmount`, but never reduced `payments[]` / `amountPaid`, so "collected" was overstated and the invariant broke.
*Fix:* New pure `computeReturnSettlement(sale, refund)` splits every refund into:
- `dueReduction = min(refund, dueAmount)` — cancels what was still owed (no cash leaves), and
- `cashRefund = refund − dueReduction` — already-paid money handed back; `payments[]` and `amountPaid` are reduced (greedy) by this amount.
Now Collected correctly drops to **₹500**. Works for **walk-in, registered, partial, full, and replacement** legs (replacement reuses the same engine). Covered by `tests/returns.test.js` (4 cases, each asserting the invariant).

**BUG #2 — Ledger over-credited on returns.**
*Root cause:* a return credited the customer ledger by the **full** refund even when part (or all) of that refund was cash going back out — inflating the apparent balance movement and risking a negative/!= ledger state.
*Fix:* the ledger now records **only the balance change** (`type:"return", amount:−dueReduction`). A pure cash refund (`dueReduction == 0`) writes **no** ledger row (balance didn't move). `customer.pendingBalance −= dueReduction`, `customer.totalPaid −= cashRefund`, `customer.totalPurchased −= refund`. Outstanding now always matches the ledger.

**BUG #3 — Replacement left the customer wrongly owing the carried value.**
*Symptom:* an even (same-value) swap on a fully-paid sale ended with the customer owing the full replacement amount, even though the UI promised a cash-neutral swap.
*Root cause:* the return leg refunded the paid cash, but the new replacement sale was created independent of that credit → it booked the whole amount as due.
*Fix:* new pure `computeReplacementCredit({ cashRefund, replacementTotal, extraPaid })` carries the freed-up cash into the replacement as a `"credit"` payment:
- `carriedCredit = min(cashRefund, max(0, replacementTotal − extraPaid))` — applied to the new sale,
- excess on a lower-value swap is returned as cash.
Result: same-value → due 0; higher-value → customer pays only the difference; lower-value → excess refunded. Covered by `tests/replacement.test.js` (5 cases).

**BUG #4 — Dashboard & analytics revenue not netted for returns.**
*Root cause:* `summary` (month + today), the 14-day `dailySeries`, and analytics `topProducts` summed gross `total` / `subtotal`, so a return reduced inventory but not the headline revenue, and per-product revenue ignored returned units.
*Fix:* all revenue aggregates now compute `total − returnedAmount` (`$subtract` with `$ifNull`), and per-product revenue prorates by returned quantity (`subtotal × (qty − returnedQty)/qty`). Dashboard numbers now match their source rows. (Monthly profit and customer revenue already netted via the profit engine.)

---

### 3. Security & Hardening (verified / retained)

- **Auth/JWT/ownership unchanged.** Every sale/return/replace/import query is scoped to `owner: req.user._id`. No route or collection renamed; all fields additive.
- **Negative inventory blocked** — sale + replacement reject when `product.stock < qty`; restock clamps `soldCount ≥ 0`.
- **Over-return / double-return blocked** — per line `returnable = quantity − returnedQty`; returning more throws; `returnStatus` derived from returned vs sold quantity.
- **Walk-in cannot carry due** (no ledger) and **cannot be replaced** — both rejected server-side.
- **OCR is read-only** — `/import/extract` never writes; inventory is created only by `/import/commit` after user review, with required-field validation.
- **Input validation** — `clampLimit`/`clampPage`/`posInt`/`nonNegNumber` on pagination, returns, replacement, and filters; error handler honors thrown `status` codes.
- **Secrets** — API keys read from env only; none hardcoded.

### 4. Performance

- Financial reads use bounded windows + indexed aggregations; no N+1 (profit uses a batch-loaded cost map). Money settlement is pure in-memory math.
- **Indexes (retained, no new ones required this sprint):** `Sale {owner,createdAt}`, `{owner,customer,createdAt}`, `{owner,paymentStatus,createdAt}`; `ReturnRecord {owner,createdAt}`, `{owner,sale,createdAt}`; `LedgerEntry {owner,customer,createdAt}`.

### 5. Testing checklist

Automated (`cd server && npm test` → **38 pass**): discount engine, profit engine (incl. returns net), `computeReturnSettlement` (4), `computeReplacementCredit` (5), OCR normalize, sales filters/sort/date-range/search.

Manual smoke (recommended before deploy):
- [ ] Walk-in: Sale ₹1000 paid → Return ₹500 → **Collected ₹500**, stock +, revenue/profit/health drop.
- [ ] Registered fully paid: Return → cash refunded, balance unchanged, **no** ledger credit row.
- [ ] Registered partly paid: Return → due cancelled first, ledger −dueReduction, collected unchanged.
- [ ] Replacement same/higher/lower value → due 0 / pays difference / cash back; balance correct.
- [ ] Dashboard month + today + 14-day chart + analytics top-products reflect net-of-returns.
- [ ] OCR import: extract shows a review table; nothing saved until commit.

### 6. Deployment notes

- **No migration required.** All changes are additive and backward-compatible; legacy sales (`returnedAmount` absent) read as 0 and satisfy the invariant. `payments[].method` already allowed `"credit"`.
- Server: `npm install && npm start` (Node 18+). Client: `npm install && npm run build`. Env: `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, optional WhatsApp/SMTP vars. Rotate any key shared in plaintext during development.

### 7. Remaining known issues (transparency)

- **Returns are not transactional across documents.** Restock, sale update, customer balance, and ledger are sequential writes; a mid-operation crash could leave a partial state (no money is lost, but a manual reconcile may be needed). A MongoDB multi-document transaction is the recommended next hardening step.
- **Replacement collection timing.** Carried credit is booked on the replacement day under the `"credit"` method while the original sale's collection drops on its own date — net cash is preserved, but a cross-month replacement shifts *when* collection is attributed. Balances/revenue/profit are unaffected.
- Floating-point money is mitigated with `round2` everywhere; values are paise-rounded, not stored as integer minor units.

---

## Final Release Candidate — Analytics drill-down, Pro inventory controls, Returns + Replacement, Pagination, Hardening

Production-readiness release. Polish + operational completion. Additive-only, no renamed collections/routes, historical data valid.

### Phase A — Analytics drill-down
- **Revenue** modal adds **Top products** and **Top customers** (by revenue), alongside revenue/profit/orders/AOV, with date presets.
- **Collections** redesigned: no duplicate summary cards — now a **records table** (customer, method, date, reference, amount) for the selected range + range total.
- **Outstanding**: records table with **days outstanding + risk level** (High/Medium/Low) + total/overdue/recent.
- **Inventory**: value, distribution, low/out, dead, plus fast/slow lists.

### Phase B — Professional inventory controls
Replaced filter chips on Products with design-system **Select dropdowns**: Status (All/Low/Out/Fast/Slow), Quantity (<10/<25/<50/Custom), Sort (Newest/Oldest/Stock ↑↓/Best/Least selling). Filtering + sorting now run **server-side**. (Category filtering can slot into the same param shape later.)

### Phase C — Returns + Replacement with audit trail
- **ReturnRecord** collection = full audit trail (items, refund, reason, notes, linkage). Returns now capture **reason + notes**.
- **Replacement v1** (`POST /api/sales/:id/replace`): returns the old items + creates a linked replacement sale, computes the **price difference** (customer pays extra, or gets credit), updates inventory + ledger + profit. New sale carries `replacementOf`.
- Invoice view shows **linked Return & Replacement history**; the replacement modal lets you pick returned items + replacement products and settle the difference.

### Phase E — Pagination & performance
Server-side pagination on **products, sales, customers** (`page`/`limit` + `{ total, page, pages }`), with **Load more** in the UI. Customers list returns a portfolio `summary` so Ledger totals stay correct while paginated. No N+1: profit uses a batch-loaded cost map; analytics aggregate in bounded windows.

### Phase F — Security hardening
- Error handler now honors thrown `status` codes.
- Input validation helpers (`clampLimit`, `clampPage`, `posInt`) on pagination + return/replacement inputs.
- Guards: cannot over-return (returnable cap), cannot return more than sold, soldCount clamped ≥ 0, OCR file-type allowlist, analytics metric validated. Auth/JWT/ownership scoping unchanged.

### Schema changes (additive, no migration)
- New `ReturnRecord` collection (returns/replacement audit).
- `Sale`: `+replacementOf`.
- `LedgerEntry.type`: `+"return"` (from prior sprint, retained).

### API changes (backward compatible)
- New: `POST /api/sales/:id/replace`, `GET /api/sales/:id/returns`.
- `POST /api/sales/:id/return` now accepts `reason`, `notes` (returns a `record`).
- `GET /api/sales`, `/api/products`, `/api/customers` accept `page`/`limit` and return `{ total, page, pages }`; `/api/products` accepts `status`, `maxQty`, `sort`; `/api/customers` returns `summary`.
- `GET /api/dashboard/analytics` enriched (topProducts/topCustomers, collection records, outstanding records+risk, inventory fast/slow).

### New indexes
- `ReturnRecord`: `{ owner, createdAt }`, `{ owner, sale, createdAt }`.
- Pagination reuses existing `{ owner, createdAt }` indexes on sales/products and `{ owner, updatedAt }` on customers.

### Testing checklist
Automated (`cd server && npm test` — 29): profit, discounts, OCR normalization, date range, invoice format, sales query.
Manual — regression: inventory, OCR, sales, discounts, multi-payment, ledger, WhatsApp, PDFs all still work. New: revenue drill-down (top products/customers); collections records; outstanding risk; inventory analytics; Products dropdown filters + sort + Load more; Sales/Ledger Load more (Ledger summary stays correct); **return** (reason/notes → stock+ledger+profit, audit row); **replacement** (return + new sale, price difference settles, linked history); edge cases (over-return blocked, walk-in replacement blocked). Responsive + dark theme + PWA install.

### Deployment
1. `cd server && npm install` (no new deps) && redeploy — new `ReturnRecord` collection + indexes apply automatically; no migration.
2. `cd client && npm install && npm run build` && redeploy.
3. Confirm `GEMINI_API_KEY`. Smoke-test the manual checklist.

---

## Final Pre-Launch Sprint — BI v2, Analytics, Profit, Inventory Filters, Returns, OCR hardening

Completion + usability sprint. Production-safe, additive-only. No renamed collections/routes, no removed fields; historical data stays valid.

### Phase A — Business Intelligence v2 (specific, data-backed)
Action insights are now **named and data-backed** instead of generic. Each carries a title (with the product/customer name), supporting metrics, a suggested action, and a priority (Urgent / Important / Opportunity). Examples generated deterministically:
- Low stock: "Peri Peri Makhana is running low — Current stock 8, Avg weekly sales 24, Est. stockout 3 days → Restock now."
- Dues: "Recover ₹42,500 from 4 customers — Largest: Ravi Traders ₹18,000 → Contact top overdue customers."
- Slow moving: "Chocolate Makhana isn't selling — 140 units, no sale in 47 days, ₹8,400 blocked → Run a discount."
- Fast moving: "Classic Makhana generated 31% of monthly revenue → Increase stock."

### Phase B — Dashboard analytics (clickable cards)
All four KPI cards are now clickable → a clean detail modal (`GET /api/dashboard/analytics`):
- **Revenue** → revenue, **profit**, orders, avg order value (Today / Yesterday / This week / This month / Last month).
- **Collected** → today / week / month.
- **Outstanding** → total due, overdue (30d+), recent, top customers by outstanding.
- **Inventory value** → value, stock distribution, low/out lists, dead inventory.

### Phase C — Profit Engine
Profit = (sale total − returns) − COGS, where COGS uses a **cost-price snapshot** stored on each sale item (legacy sales fall back to current product cost via a batch-loaded cost map — no N+1). Surfaced on the dashboard (month profit), in revenue analytics, and used by returns. `utils/profit.js` is pure + tested.

### Phase D — Inventory filters
Products page filter chips: Low stock, Out of stock, Fast moving, Slow moving, and quantity thresholds (< 10 / < 25 / < 50) — client-side over the loaded catalog, supporting the Action Center.

### Phase E — Returns v1 (simple, stable)
`POST /api/sales/:id/return` — partial or full. Restocks inventory (and corrects soldCount), credits the customer ledger (new `return` entry, reduces pending), records `returnedAmount`/`returnStatus` on the sale, and profit auto-adjusts. UI: a **Return** action in the invoice view with a per-item quantity modal.

### Phase F — OCR stabilization (no scope expansion)
Stricter validation (server rejects unsupported file types; 4 MB cap; clear errors), graceful empty-extraction message, and the review workflow flags items needing attention. Flow unchanged: Upload → Extract → Review → Margin → Approve → Create. Still no auto-creation.

### Schema changes (additive, no migration)
- `Sale.items[]`: `+costPrice` (cost snapshot), `+returnedQty`.
- `Sale`: `+returnedAmount`, `+returnStatus` ("none"/"partial"/"full").
- `LedgerEntry.type`: `+"return"`.

### API changes (backward compatible)
- New: `GET /api/dashboard/analytics?metric&from&to`, `POST /api/sales/:id/return`.
- `GET /api/business-health/actions` now returns richer `{ title, metrics[], action, priority }`.
- `GET /api/dashboard/summary` now includes `profitThisMonth`.
- `POST /api/products/import/extract` validates `mimeType`.

### New indexes
None required — analytics/returns reuse the existing owner-scoped compound indexes (`{owner,createdAt}`, `{owner,customer,createdAt}`). Profit is computed in-app over the bounded month window with a batch-loaded cost map (no N+1). Inventory filters run client-side.

### Environment variables
None new.

### Testing checklist
Automated (`cd server && npm test` — 29 tests): profit (snapshot, fallback, returns, aggregate), discount math, OCR normalization, date range, invoice format, sales query.
Manual — regression: existing inventory, sales, ledger, WhatsApp, PDF, OCR, discounts, multi-payment all still work. New: named action insights; click each KPI → analytics (revenue shows profit; ranges switch); profit on dashboard; inventory filters (low/out/fast/slow/qty); returns (partial + full → stock up, ledger credited, profit down); OCR rejects bad files + review flags attention.

### Deployment
1. `cd server && npm install` (no new deps) && redeploy. No migration; new fields/indexes apply automatically.
2. `cd client && npm install && npm run build` && redeploy.
3. Confirm `GEMINI_API_KEY` set. Smoke-test the manual checklist.

---

## Master Sprint — Discounts, Multi-Payment, Unified Product Creation + OCR, Actionable BI

Production-safe, additive-only. No renamed collections/routes, no removed fields; historical sales, invoices, and ledgers stay valid (legacy sales simply have zero discounts and `subtotal === total`).

### Part 1 — Discount Engine (new)
- Item-level (percent or flat ₹) and bill-level (percent or flat ₹) discounts.
- Pure, tested engine `server/utils/saleMath.js` computes and **stores** `subtotal`, `itemDiscountTotal`, `billDiscount{Type,Value,Amount}`, `totalDiscount`, `total` so invoices are immutable.
- Shown in: Sale wizard (per-line discount + bill discount + live subtotal/discount/total), Sale history invoice view, PDF invoice, and WhatsApp invoice. Ledger reflects the discounted `total`.

### Part 2 — Multi-Payment (extended)
- `payments[]` (cash/upi/bank/card/credit) already existed; now discount-aware. `amountPaid = Σ payments`, `dueAmount = total − amountPaid` (Due stays derived, not a payments row). Payment breakdown shown on PDF + WhatsApp.

### Part 3 — Unified Product Creation + OCR (new)
- One "Add product" flow → **Manual** or **Import supplier invoice**.
- Manual: added Brand, Unit, GST %, HSN, Margin % with **cost + margin ⇄ selling** two-way auto-calc.
- OCR via existing **Gemini vision** (no new dependency/key). `POST /api/products/import/extract` reads an image/PDF and returns normalized draft items — **never writes to the DB**. Field/unit normalization in `server/utils/ocrNormalize.js` (Qty/QTY/Nos/PCS→quantity; Rate/Unit Price/Purchase Rate→cost; split CGST+SGST→gstPct).
- Mandatory **review workflow**: per-product edit, approve/skip, "apply margin to all", extracted/approved/attention counts. Inventory is created only on confirm via `POST /api/products/import/commit`.

### Part 4 + 6 — Actionable BI + Business Health integration (extended)
- Deterministic `generateActionInsights` (in `healthService`) → ≤2-line items, each with action + reason + priority (Urgent / Important / Opportunity): recover dues, restock fast-movers (runout forecast), idle/dead stock, low stock, collection efficiency, revenue concentration. Surfaced in a dashboard **Action center**. Not a chatbot.

### Part 5 — WhatsApp formatting (extended)
- Invoice messages now include subtotal + discount + per-method payment breakdown + paid/due.

### Schema changes (additive, no migration)
- `Product`: `+brand, +unit (default "pcs"), +gstPct, +hsn, +marginPct`.
- `Sale.items[]`: `+discountType, +discountValue, +discountAmount, +gross`.
- `Sale`: `+subtotal, +itemDiscountTotal, +billDiscountType, +billDiscountValue, +billDiscountAmount, +totalDiscount`.

### API changes (all backward compatible)
- `POST /api/sales` now accepts `items[].discountType/discountValue` and `billDiscount{type,value}` (optional).
- `POST /api/products` + `PUT /api/products/:id` accept the new product fields.
- New: `POST /api/products/import/extract`, `POST /api/products/import/commit`, `GET /api/business-health/actions`.

### Environment variables
- **None new.** OCR reuses `GEMINI_API_KEY`. (Server JSON body limit raised 6 MB → 8 MB for invoice uploads.)

### Testing checklist
Automated (`cd server && npm test` — 25 tests): discount math (item/bill/combined/flat/percent, no-discount backward compat, clamp), OCR normalization (unit + rate/qty aliases, split GST), date-range, invoice format, sales query.
Manual: record sale with item + bill discounts → verify PDF/WhatsApp/ledger; single + multi + partial payment; import single/multi-product invoice (GST + non-GST, low-quality image, multi-page) → review → commit; manual product margin auto-calc; Action center on dashboard. Regression: existing inventory/sales/ledger/PDF/WhatsApp/Business Health all still work; legacy `SV-*` invoices open with `subtotal === total`.

### Deployment
1. `cd server && npm install` (no new deps) && redeploy (Railway). New indexes/fields build automatically; no migration.
2. `cd client && npm install && npm run build` && redeploy (Vercel).
3. Confirm `GEMINI_API_KEY` is set (OCR + insights). Smoke-test the manual checklist.

---

## Landing Page V2 — Public website

Added a premium public marketing site and restructured routing so the landing page is the homepage and the app lives under `/app`.

**Routing (production-safe, existing app preserved):**
- `/` → public landing page (always accessible)
- `/login`, `/signup` (alias of the old `/register`, which now redirects), `/forgot-password`, `/reset-password`
- `/app` → authenticated app (Dashboard), with `/app/products`, `/app/sales`, `/app/ledger`, `/app/ai`, `/app/whatsapp`, `/app/settings`
- All in-app navigation, auth redirects, and Dashboard quick-links updated to `/app/*`. Added `client/vercel.json` SPA rewrite so deep links resolve on refresh.

**Landing (`client/src/pages/Landing.jsx`):** 12 sections — navbar, hero, problem, the Bizzrow way, features, product showcase, outcomes, social proof, pricing (monthly/yearly toggle, Growth highlighted), PWA install, FAQ, final CTA, footer. Dark by default with the specified palette (#080B14 / #111827 / #2563EB / #60A5FA / #94A3B8), Inter, restrained premium styling, framer-motion scroll reveals, and the **four real product screenshots** (bundled in `client/public/marketing/`) shown in browser frames. No fabricated stats or testimonials.

**SEO:** title, description, keywords, canonical, Open Graph + Twitter tags, and `SoftwareApplication` JSON-LD added to `client/index.html`; theme-color set to the landing background.

A live, self-contained HTML preview of this design was also published for review.

---

## Sprint 1.1.1 — Dropdown portal hotfix

Fixes a regression from the Sprint 1.1 themed `Select`: its menu rendered inside the filter card, so it was clipped, layered behind sale cards, and only partly scrollable. The `Select` menu now renders in a **React portal to `document.body`** with fixed positioning (Radix / Headless-style):

- Renders above all page content (`zIndex: 1000`) and escapes any parent stacking context.
- No longer clipped by parent `overflow`/layout — it's no longer constrained by the card.
- Own scroll area with a viewport-aware `max-height`; full option list scrolls; `overscroll-contain` prevents scroll chaining on mobile.
- Flips above the trigger when space below is tight; repositions on scroll/resize (capture-phase scroll listener); closes on outside pointer-down or Escape.
- Desktop + mobile via pointer events. **Filter functionality is unchanged** (same `value`/`options`/`onChange`).

**Audit result:** the only custom dropdown in the app is this `Select` (used by the Sales date / payment / sort filters). Customer, product, and ledger filters use design-system buttons + native inputs and were unaffected — no portal needed there.

---

## Sprint 1.1 — Production Hardening & QA Fix Release

**Type:** Bug-fix / hardening. No new features. Strict backward compatibility — no renamed collections/routes, no removed fields; existing sales + invoice history remain valid.

### Bug-fix summary
- **#1 Sales date filters (FIXED):** root cause was a timezone mismatch — the server parsed `from` as a UTC date but built `to` with server-local `setHours()`, so "Yesterday/Today" intermittently returned nothing. The client now sends absolute ISO instants for the user's local day boundaries, and the server parses them through one canonical helper (`utils/dateRange.js`) against the single `createdAt` field. Old and new records behave identically. Covered by automated tests.
- **#2 Invoice numbering (FIXED):** replaced random `SV-MMYY-####` with sequential **`BZR-<year>-000001`** via an atomic Mongo `Counter` (per owner + year) — concurrency-safe and unique. Historical numbers are untouched; only new invoices use the new format.
- **#3 Ledger PDF pagination (FIXED):** the footer was drawn at y≈790, below the usable area, so even short statements spilled onto a 2nd page. Rewrote with a reserved footer band + dynamic page breaks; header/content/footer stay on one page when they fit, with proper multi-page support and long name/address wrapping.
- **#4 Filter UI consistency (FIXED):** replaced the browser-native `<select>` in the Sales filter bar with a themed `Select` design-system component (consistent in light + dark). Audited customer/product/ledger filters — those already use design-system buttons/inputs.
- **#5 Mongo performance (HARDENED):** added owner-scoped compound indexes (see Index summary).
- **#6 Search & filter QA:** automated tests + the expanded manual checklist below.

### Index summary
| Collection | Index | Why | Impact |
| --- | --- | --- | --- |
| sales | `{ owner:1, createdAt:-1 }` | default list + date filter/sort | avoids collection scan + in-memory sort |
| sales | `{ owner:1, customer:1, createdAt:-1 }` | per-customer sales / customer filter | direct index hit |
| sales | `{ owner:1, paymentStatus:1, createdAt:-1 }` | payment-status filter | index-served filtering |
| ledgerentries | `{ owner:1, customer:1, createdAt:1 }` | statement generation (chronological) | ordered read, no sort stage |
| products | `{ owner:1, createdAt:-1 }` | product list | owner-scoped list, no scan |
| products | `{ owner:1, name:1 }` | name lookups / sorted access | narrows candidates for name search |
| customers | `{ owner:1, updatedAt:-1 }` | ledger customer list | owner-scoped recent list |
| whatsapplogs | `{ owner:1, createdAt:-1 }` | delivery log | fast recent-first log |

Note: free-text "contains" search uses a case-insensitive (non-anchored) regex, which isn't fully index-served; the owner-scoped indexes restrict the candidate set first, which is the meaningful win. We deliberately did **not** index the rare amount-sort, to avoid write overhead. Indexes build automatically on server start (Mongoose); on large Atlas collections, allow time for background builds.

### Test checklist (Sprint 1.1)
Automated — `cd server && npm test` (Node's built-in runner, no extra deps):
- [x] date-only → UTC day bounds; ISO instants pass through; invalid → null
- [x] invoice number format `BZR-YYYY-000001`, zero-padding, large sequences
- [x] sales filter builder: status / customer / date / search / sort

Manual QA:
- [ ] Sales date filters: Today, Yesterday, This week, This month, Last month, Custom — all return expected rows (verify in your timezone, especially early-morning sales).
- [ ] Payment filters Paid/Partial/Due; sort Latest/Oldest/Highest/Lowest.
- [ ] New sale → invoice number is `BZR-<year>-<next>`, increments by 1, stays unique under rapid repeated sales.
- [ ] Ledger statement PDF: single transaction, multiple, long customer name, long address, multi-page — header/content/footer correct, no stray blank page.
- [ ] Filter dropdowns match the theme in light + dark.
- [ ] Product search (name/SKU) + customer search (name/phone) still work and stay fast on large lists.

### Regression (must still pass)
- [ ] Auth + forgot/reset password; inventory decrement on sale; sale creation; ledger updates; dashboard; WhatsApp send; PDF invoice generation; existing `SV-*` invoices still open.

### Deployment (Sprint 1.1)
1. Pull/unzip over the existing repo. **No new dependencies, no env changes.**
2. Server (Railway): redeploy. Indexes build automatically on connect (optionally pre-build on Atlas for large collections). Run `npm test` in CI/locally to confirm logic.
3. Client (Vercel): redeploy (`npm install && npm run build`).
4. No DB migration. Existing invoice numbers, sales, and ledgers are untouched; new invoices adopt the `BZR-` format going forward.

---

# Bizzrow — Sprint 1 Changelog

**Release:** Stability, Search & Rebranding
**Type:** Production upgrade of an existing app (formerly SmartVyapaar → Thybizz → **Bizzrow**)
**Backward compatibility:** No DB/collection renames, no route-path changes, additive-only schema. Existing users, products, sales, ledgers, and invoices remain valid with zero migration.

---

## 1. Rebranding (Thybizz/SmartVyapaar → Bizzrow)

All **visible** branding updated; nothing internal renamed.

- Frontend: browser tab title, favicon glyph (S→B), sidebar/top-bar identity + wordmark, Login/Register/Forgot/Reset screens, AI "Intelligence Engine", invoice header fallback, WhatsApp test copy + preview.
- Backend: AI system prompt ("Bizzrow Intelligence"), WhatsApp invoice/reminder default brand, PDF header + "Generated by Bizzrow" footer, boot log, package metadata, `.env.example`.
- Docs: README + this changelog.
- **Unchanged on purpose:** Mongo db name `smartvyapaar`, all collections (`users`, `products`, `customers`, `sales`, `ledgerentries`, `aiinsights`, `whatsapplogs`), and every `/api/...` route path.

## 2. Forgot / Reset Password

- `POST /api/auth/forgot-password` `{ email }` → always returns a generic message (no email enumeration). Generates a random token, stores **only its SHA-256 hash** + 1-hour expiry on the user, emails a reset link.
- `POST /api/auth/reset-password` `{ token, password }` → validates the hashed token + expiry, sets the new password (bcrypt), **clears the token (one-time use)**, and auto-logs-in (returns JWT).
- Email via `server/services/mailer.js` (nodemailer). If SMTP is not configured, the endpoint still succeeds and logs the link to the server console (and returns `devLink` when `NODE_ENV !== production`), so the flow never blocks.
- New client pages: `/forgot-password`, `/reset-password` (mobile-friendly). "Forgot password?" link added to Login.

## 3 & 4. Product + Customer Search in Create Sale

- `GET /api/products?q=&limit=` — `q` searches name/SKU/category/color/size (capped for large inventories). No params = existing behavior (returns all).
- `GET /api/customers?q=` — `q` searches name/phone/shopName. No params = existing behavior.
- Create Sale modal now uses **debounced (250 ms), server-backed** search for both products and customers — performant on large datasets, fully mobile-friendly.

## 5. Sales Filters

`GET /api/sales` now accepts optional, backward-compatible params:
`q` (customer name), `status` (paid|partial|unpaid), `customerId`, `from`, `to` (inclusive day range), `sort` (latest|oldest|highest|lowest). No params = latest 200 (unchanged).
The Sales page gained a filter bar: date presets (Today / Yesterday / This week / This month / Last month / Custom), payment status, customer search, and sorting.

## 6. Customer Ledger Statement

- `GET /api/ledger/:customerId/statement?from&to` → `{ openingBalance, entries:[{date,type,note,amount,balance}], closingBalance }` (running balance computed from signed entry amounts).
- `GET /api/ledger/:customerId/statement/pdf?from&to` → downloadable PDF statement (pdfkit), branded Bizzrow.
- Client: "View ledger statement" in the customer drawer → modal with date presets, opening/running/closing balances, and **Download PDF**. A placeholder line notes future WhatsApp sharing.

## 7. Global Search Architecture

- `server/utils/search.js` — `escapeRegex` + `buildTextFilter(q, fields)`, reused by products/customers/sales and ready for ledger/global use.
- `client/src/hooks/useDebounce.js` — reusable debounce used by the sales search + filters.

---

## New environment variables (server/.env)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SMTP_HOST` | for email | — | SMTP host for reset emails |
| `SMTP_PORT` | no | `587` | SMTP port (`465` = secure) |
| `SMTP_SECURE` | no | `false` | `true` for port 465 |
| `SMTP_USER` | for email | — | SMTP username |
| `SMTP_PASS` | for email | — | SMTP password |
| `SMTP_FROM` | no | `Bizzrow <no-reply@bizzrow.app>` | email From header |
| `NODE_ENV` | no | `development` | non-`production` returns `devLink` from forgot-password |

`CLIENT_ORIGIN` (already existed) is now also used as the base URL for the reset link — set it to your deployed frontend URL in production.

New dependency: **`nodemailer`** (`server/package.json`). Run `npm install` in `server/`.

---

## Database schema changes

Additive only (no migration required):

- `User.resetTokenHash` (String, default `""`)
- `User.resetTokenExpiresAt` (Date)

Existing documents simply don't have these until a reset is requested. No collection/field was renamed or removed.

---

## Testing checklist

### Authentication
- [ ] Register a new account → lands logged-in.
- [ ] Login with correct/incorrect credentials.
- [ ] Forgot password with a real email → generic success; with SMTP off, link appears in server log / `devLink`.
- [ ] Reset password via the link → password changes, auto-login; link is rejected on reuse and after 1 hour.

### Products
- [ ] Product search by name, SKU, and category returns correct, debounced results.
- [ ] Large product list (500+) stays responsive in the Create Sale search.

### Customers
- [ ] Customer search by name and phone returns correct results in Create Sale.

### Sales
- [ ] Date filters: Today / Yesterday / This week / This month / Last month / Custom.
- [ ] Payment filters: Paid / Partial / Due.
- [ ] Customer search filter; sort by Latest / Oldest / Highest / Lowest.

### Ledger
- [ ] Statement opening/running/closing balances are correct for a date range.
- [ ] Statement PDF downloads and matches the on-screen figures.

### Regression (must still pass)
- [ ] Recording a sale still decrements inventory correctly.
- [ ] Sales still create correctly (existing customer, with/without due).
- [ ] Ledger still updates on sale + payment.
- [ ] Dashboard analytics still load.
- [ ] WhatsApp invoice/reminder/broadcast still send.
- [ ] PDF invoices still generate and download.

---

## Deployment instructions

1. **Pull / unzip** the new build over your existing repo.
2. **Server (Railway):**
   - `cd server && npm install` (adds `nodemailer`).
   - Add the new env vars (`SMTP_*`, `NODE_ENV=production`) in Railway. Ensure `CLIENT_ORIGIN` points to your Vercel frontend URL.
   - Deploy. No DB migration needed.
3. **Client (Vercel):**
   - `VITE_API_URL` unchanged. Redeploy from the new build (`npm install && npm run build`).
4. **Smoke test** on production: login, run the testing checklist above (especially the regression list).
5. Reset tokens are hashed at rest; rotate `JWT_SECRET` only if you intend to invalidate existing sessions (optional, not required for this release).

No breaking changes — existing data and integrations continue to work.
