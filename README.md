# 🚀 Bizzrow

<div align="center">

### Business Management as Simple as WhatsApp

AI-Assisted Business Operating System for Retailers, Wholesalers & SMEs

![React](https://img.shields.io/badge/React-18-blue)
![Node](https://img.shields.io/badge/Node.js-Express-green)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)
![Vercel](https://img.shields.io/badge/Frontend-Vercel-black)
![Railway](https://img.shields.io/badge/Backend-Railway-purple)
![License](https://img.shields.io/badge/License-MIT-yellow)

</div>

---

## 📖 About Bizzrow

Bizzrow is a modern Business Operating System built for Indian retailers, wholesalers, garment traders, FMCG businesses, hardware stores, and SMEs.

Most businesses still operate using:

* WhatsApp
* Excel Sheets
* Paper Registers
* Memory

Traditional ERP systems are often complex, expensive, and difficult to adopt.

Bizzrow simplifies daily business operations through:

* Inventory Management
* Sales Tracking
* Customer Ledger
* WhatsApp Automation
* PDF Invoicing
* Business Intelligence
* AI-Assisted Data Entry

### Core Philosophy

> Businesses do not hate software.
>
> Businesses hate data entry.

Every major product decision in Bizzrow is built around reducing operational friction.

---

## 🎯 Problem Statement

Small businesses struggle with:

* Manual inventory updates
* Tracking customer dues
* Maintaining ledgers
* Creating invoices
* Following up on payments
* Understanding business performance

Most existing software adds complexity.

Bizzrow aims to remove it.

---

## ✨ Key Features

### 📦 Inventory Management

* Add / Edit / Delete Products
* Inventory Tracking
* Inventory Valuation
* Stock Visibility
* Product Categorization
* Separate wholesale and retail prices; legacy selling prices remain wholesale prices
* Optional cost price when supplier cost is unknown
* Complete tenant-scoped inventory CSV export and exact-match duplicate review
* Purchase batches with FIFO sale deduction, batch cost snapshots, and batch-aware returns

The Products page exports the complete tenant catalog (independent of the current
search, filters, and pagination) as a date-stamped CSV. Duplicate review reports
exact SKU/barcode matches and exact name + size + colour matches; it never merges
or edits records.

New stock purchases can be recorded as dated batches from a product card.
Batch creation and aggregate stock updates are transactional. Sales consume
available batches FIFO and save the allocations with the sale; returns restore
the originally allocated batch stock. Existing product stock is shown as
legacy/unbatched stock and is not assigned invented dates or costs. Initial
product/import stock remains unbatched, and historical sales/returns without
saved batch allocations continue using the existing aggregate-stock behavior.

---

### 💰 Sales Management

* Fast Checkout
* Retail / wholesale sale mode with snapshotted prices
* Product Search
* Direct quantity entry and flat / percentage discounts
* Customer Search
* Sales History
* Walk-In Customer Support

---

### 💳 Multi-Payment Engine

Supports:

* Cash
* UPI
* Bank Transfer
* Due Payments

Example:

Cash ₹2000

UPI ₹3000

Due ₹1000

---

### 📒 Customer Ledger

* Outstanding Tracking
* Ledger Statements
* Running Balance
* PDF Export

---

### 🔄 Returns & Replacements

* Partial Returns
* Full Returns
* Inventory Restoration
* Ledger Updates
* Collection Adjustments

Financial write endpoints (`POST /api/sales`, sale returns/replacements, and
`POST /api/ledger/:customerId/payment`) require an `Idempotency-Key` header
(8–200 characters). Retrying the same key and payload replays the prior result;
reusing a key with a different payload returns a conflict. Clients that omit the
header receive a 400 response. Sale payments accept
cash, UPI, bank, and card splits only, and the total collected cannot exceed the
sale total or customer's outstanding balance. Ledger payments are allocated to
the customer's oldest outstanding sales. Replacement carry-forward is tracked
separately from tender, so it is not counted as a collection. Returns allocate
bill discounts proportionately across line items and quantities.

For initial sale checkout, clients may send `cashTendered` as a non-negative
amount with at most two decimal places, together with a `payments` array
containing only positive non-cash splits. The server applies non-cash payments
first, applies cash up to the remaining invoice amount, and records the excess
as `cashChange`. Cash splits, `amountPaid`, `paymentMethod`, and client-supplied
`cashChange` cannot be combined with `cashTendered`. Without `cashTendered`,
existing payment fields continue to represent amounts collected. Payment inputs
on initial checkout must have at most two decimal places. Positive cash tender
is rejected on a zero-value invoice. Tender and change are optional original
checkout snapshots and are not inferred for older sales; they are not refunds.
Initial sale requests may also include `expectedTotal` as a non-negative
amount with at most two decimal places. The server compares it with its
authoritative total and returns a conflict if they differ; it is never used
to calculate or record the sale. Existing callers may omit this field.
Checkout may also send `reviewedItems`, an array containing one entry per
product with `productId`, `quantity`, and the reviewed `unitPrice` rounded to
paise. The server compares these against its prepared item prices and quantities
and rejects missing, duplicate, unexpected, or changed lines before reserving
the idempotency key. The snapshot is only a comparison and never sets sale
prices. Existing callers may omit it.
New sale, replacement, received-batch, stock-adjustment and opening-stock
quantities allow up to three decimal places. Returns of older sale lines whose
stored quantities have greater precision may use that historical precision.
Stock and return arithmetic uses decimal operations without rounding historical
balances to three places. Quantities remain stored as MongoDB numbers: if an
exact result cannot be represented without losing decimal digits, the
operation fails and requires reconciliation rather than silently rounding.
For a historical returned quantity that cannot be subtracted safely, a return
can proceed only when one sale line exists for the product and ordered prior
return records independently reproduce the stored floating-point accumulation.
Their exact decimal sum is then used for the new return; the new return record
captures both the prior stored value and the verified sum. Prior return records
are not changed. Missing, ambiguous or unsafe history requires reconciliation.
The historical precision exception does not exceed the precision recorded on
the applicable sale line or its prior returned quantity.
Requests with `cashTendered`, `expectedTotal`, `reviewedItems`, or a sale type
use server product prices. For compatibility, legacy requests omitting all
four can still supply an item `unitPrice`; those callers do not have the same
server-authoritative pricing guarantee.

The web client persists the pending key per tab and endpoint, reuses it only for
the same request payload, and keeps failed transaction forms available for retry.
To start a changed request after a failure, explicitly discard the pending
attempt first.

These financial writes require a MongoDB replica set or sharded cluster with
transaction support. The API returns an error rather than writing partially if
transactions are unavailable.

Resource-specific idempotency scopes use canonical lowercase MongoDB ObjectIds.
Retries also look up records written with earlier mixed-case route IDs. If more
than one historical record exists for the same owner, resource, operation and
key, the request fails with a conflict and requires manual review; no historical
records are changed. Old application instances can still create mixed-case
records concurrently, so drain old writers before enabling this change rather
than running mixed versions together.
New idempotency records also retain a JSON response snapshot in the transaction,
so replay does not reflect later changes to the customer, sale or stock. Older
records do not contain snapshots and retain their prior live-resource replay
behavior; their original response cannot be reconstructed. Legacy batch retries
are checked against their recorded key and fingerprint before new quantity
validation is applied.

Checkout and replacement unit prices and flat discounts, and checkout,
replacement and ledger payment amounts, must be non-negative currency values
with at most two decimal places. A saved product price with greater precision
must be corrected before it can be used for a sale. Percentage discounts are
not currency amounts. Returned values are computed from the recorded sale, not
entered as client refund amounts.
Fractional line values and percentage discounts use decimal half-up rounding
to paise; the checkout and return previews apply the same rounding rule.

Customers with a recorded sale, ledger entry, return, or nonzero financial
balance/totals cannot be deleted. Deletion of an unused customer is performed
transactionally so it cannot race with a transaction updating that customer.
Collection analytics totals aggregate the entire selected date range; the
displayed detail records remain limited to the latest 100 source records per
category, so their sum need not equal the full total.
New return ledger entries retain the due reduction as their signed balance
amount and include refund or replacement-settlement information in their note;
refund-only entries have a zero balance effect. Earlier entries are not changed.

Inventory value in dashboard and health calculations currently uses aggregate
product stock multiplied by the product's current cost, rounded to whole rupees;
it does not use batch cost snapshots. For example, 4 units at a batch cost of
₹5 and 6 at ₹10 have batch value ₹80, while a current product cost of ₹7
produces ₹70. A batch-cost valuation would need an explicit policy for
unbatched stock and batches with unknown cost; weighted-average valuation is
another alternative. The current methodology has not been changed.

#### Isolated financial integration tests

These tests must only target a disposable, single-node MongoDB replica set,
never a business or production server. The harness requires an explicit
loopback URI with the database name `bizzrow_test`, `directConnection=true`,
and `replicaSet`. It creates a new randomly named `bizzrow_test_<id>` database
per test process, verifies that it is empty and that the server is a writable
single-node replica-set primary before creating collections or indexes, and
creates and verifies the declared model indexes. It disconnects after tests.
The URI checks cannot prove a server is disposable: the operator must verify
that independently. With authentication, use a dedicated `bizzrow_test` user
with privileges restricted to the disposable test environment, not business
credentials. Dispose of the entire test server after use; test databases are
not dropped by the harness.

For example, against an independently verified local disposable replica set:

```powershell
$env:FINANCIAL_TEST_MONGO_URI = "mongodb://127.0.0.1:27017/bizzrow_test?directConnection=true&replicaSet=bizzrowTestRs"
node --test tests\*.test.js
```

Run the command from the `server` directory. Without the URI, MongoDB
integration tests are skipped; a standalone MongoDB server is insufficient.

#### Browser financial workflow tests

The browser runner requires Node.js 20+, Docker with a locally cached `mongo:7`
image, and an installed Chrome or Edge. On Windows it detects standard
installation paths; set `E2E_BROWSER_PATH` to an installed Chromium executable
when necessary. Run from the repository root:

```powershell
npm --prefix client run test:e2e
```

The runner refuses to pull an image, starts its own loopback-published disposable
replica set, generates synthetic users and data, and stops its exact container
afterward. It runs the real frontend against a loopback-only test server mounting
the application financial routes, not the complete production server. The
server does not read `server/.env`, disables external invoice messaging and
blocks messaging/reset routes. Browser page requests outside the two test
origins are blocked. The runner uses a clean temporary browser profile and
deletes its temporary directory, including test artifacts, after the run. Do
not point the tests at an existing database or use real accounts.

The suite covers login, protected routes, session persistence and invalid-token
rejection and expiry of a short-lived signed token; desktop and mobile checkout
with cash, UPI and split tender and change; a
discounted sale with outstanding balance; total-mismatch recovery, double
submission, a lost response and UI retry; partial and full returns and batch
restoration; historical fractional returns and replacements; a fractional-return
rounding boundary; and a replacement with an additional payment. Synthetic
historical data is created through a test-server-only endpoint requiring the
per-run nonce, a valid synthetic user and an owned synthetic customer. Some
replay assertions use the real API after a browser submission. Loading, empty
and error states, dropdown positioning and modal bounds are checked at two
viewport sizes. Other screen sizes, all payment combinations, accessibility,
comprehensive responsive overflow and external integrations remain untested.
Browser request interception is not an operating-system network firewall.

The test server uses the production CORS configuration, JSON parser limit,
authentication, route handlers and error middleware, with tests for preflight,
disallowed origins, unauthorized access, tenant ownership and malformed JSON.
It omits production request logging, restricts the route set, stubs invoice
messaging and adds the synthetic-fixture endpoint; it does not run the complete
production server or validate its startup, logging or external integrations.
The existing backend suite can also be run against a fresh disposable replica
set with `node client\e2e\run.cjs --backend`.
An abrupt forced termination can interrupt cleanup; inspect Docker for the
specific disposable test container before stopping it.

#### Client dependency audit (Sprint 3.3.1)

The initial audit reported 13 affected packages: 8 high and 5 moderate. Compatible
lockfile updates resolved the listed package advisories as follows:

| Initial package | Severity | Dependency path | Compatible version installed |
| --- | --- | --- | --- |
| axios | high | direct | 1.21.0 |
| baseline-browser-mapping | moderate | autoprefixer / browserslist | 2.11.35 |
| browserslist | high | autoprefixer | 4.29.5 |
| follow-redirects | high | axios | 1.16.3 |
| form-data | high | axios | 4.0.6 |
| nanoid | high | postcss | 3.3.20 |
| postcss | high | direct and vite / tailwindcss | 8.5.32 |
| postcss-selector-parser | moderate | tailwindcss | 6.1.6 |
| source-map-js | high | postcss | 1.2.2 |

Four packages remain in the audit: direct development dependency Vite 5.4.21
(high) and its esbuild 0.21.5 (moderate), plus direct react-router-dom 6.30.6
and transitive react-router 6.30.6 (both moderate). The Vite advisories affect
development-server file access and editor handling; esbuild can expose a dev
server to requests from other sites. Keep development servers isolated from
untrusted networks and browsing. The router advisories concern open redirects
with untrusted destinations and SSR hydration; avoid untrusted navigation
destinations. This client is not using SSR, but the client navigation risk is
not eliminated. npm proposes Vite 8.3.6 and react-router-dom 7.18.5, both major
upgrades requiring separate compatibility review. No forced major upgrade was
performed. Advisory data and counts can change over time.

#### Server dependency audit (Sprint 4.1)

The server audit initially reported 11 affected packages: one critical, three
high and seven moderate. Compatible updates resolved the reported advisories
for body-parser, brace-expansion, mongoose, morgan, protobufjs, proxy-addr and
qs. Express 4.22.3 supplies the compatible body-parser, proxy-addr and qs
updates. The lockfile also updates mquery with mongoose and removes an unused
protobufjs dependency.
The updated development-only brace-expansion 5.0.12 requires Node.js 20 or
Node.js 22 and newer; it no longer supports Node.js 18. This does not change
the production dependency tree.

#### Inventory audits and logout

Inventory audits snapshot each selected product's total stock, stock revision,
individual batches and unbatched balance. Enter a count for every source and
a reason for each discrepancy, save the review, then confirm approval. Approval
requires the saved review revision and uses an idempotency key and MongoDB
transaction. If stock has moved since the snapshot, start a new audit and
recount. Batch increases are permitted only when the existing adjustment
service allows reversal of prior reductions; unexplained surplus can instead
be counted as unbatched stock. The audit stores links to the resulting stock
adjustments; it does not change financial history. Counts preserving historical
precision are supported when the resulting adjustment is valid at three
decimal places.

If approval fails, retry the same request to recover a lost response. To correct
the counts instead, clear the pending approval and reload the audit to confirm
its status; a stale stock snapshot requires a new audit.

All application instances must use the stock-revision-aware code when audits
are enabled. Mixed versions or out-of-band database writes can bypass the
revision check and must not be used during an audit. Snapshot and approval
require MongoDB transaction support. The audit list shows the latest 100 audits;
product selection search shows up to 100 matches. Each audit is stored in one
MongoDB document, so very large catalogs can exceed the document size limit;
select smaller groups of products in that case.

Logout records a hash of the current JWT in an owner-scoped revocation
collection. Newly issued tokens include unique IDs, so logging out one device
does not revoke another. Previously issued identical JWTs cannot be
distinguished from one another. The token lifetime remains unchanged (seven
days by default); password reset still invalidates all older token versions.
Retrying logout with the same still-valid token is safe if its response was lost;
that token remains rejected by other protected routes.
The revocation collection declares a unique owner/token-hash index and a TTL
index on expiration. Operators must ensure declared indexes are provisioned
according to the deployment's index-management policy; no production indexes
or migrations are created by this sprint.

The production server applies per-process IP rate limits. Defaults are 30
login/registration requests per 15 minutes, 10 recovery requests per 15
minutes, 300 searches per minute, 120 dashboard/health requests per minute,
and 30 AI/OCR/WhatsApp requests per minute. Configure each group with
`RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_RECOVERY_MAX`, `RATE_LIMIT_SEARCH_MAX`,
`RATE_LIMIT_DASHBOARD_MAX` or `RATE_LIMIT_EXTERNAL_MAX` and the matching
`_WINDOW_MS` variable (for example `RATE_LIMIT_AUTH_WINDOW_MS`). Values must
be positive integers. Financial mutations are not rate-limited by these
groups. Limits are per server process, reset on restart, and do not provide
shared enforcement across instances; shared networks can share a limit.
Forwarded IPs are ignored unless `TRUST_PROXY` is explicitly set to a
comma-separated list of trusted proxy addresses/subnets understood by Express.
Configure it only after verifying the deployment's proxy topology.

Four server packages remain in the audit: direct nodemailer 6.10.1 (high),
direct uuid 9.0.1 (moderate), development dependency nodemon 3.1.14 (moderate),
and its minimatch 10.2.5 (moderate). Nodemailer and uuid require major-version
compatibility review; npm suggests downgrading nodemon to resolve minimatch,
which also requires separate review. An advisory does not establish that its
affected functionality is reachable in this application. The client audit
still reports the four packages documented above. Audit results can change as
new advisories are published.

---

### 📄 PDF Invoices

* Branded Invoices
* Downloadable PDFs
* Customer Sharing
* Ledger Statements

---

### 📲 WhatsApp Integration

Powered by Meta WhatsApp Cloud API

* Invoice Delivery
* Payment Reminders
* Customer Notifications

---

### 🤖 OCR-Assisted Inventory Creation

One of Bizzrow's flagship features.

Workflow:

Supplier Invoice

⬇

AI Extraction

⬇

Human Review

⬇

Margin Application

⬇

Inventory Creation

Unlike traditional OCR systems, Bizzrow prioritizes trust and accuracy over blind automation.

---

### 📊 Business Intelligence

Provides actionable insights such as:

* Low Stock Alerts
* Fast Moving Products
* Slow Moving Products
* Collection Risks
* Revenue Analysis

---

## 🏗️ System Architecture

Frontend

React + Vite + Tailwind

⬇

REST APIs

⬇

Node.js + Express

⬇

MongoDB Atlas

⬇

Business Logic Engine

⬇

Analytics + AI Layer

⬇

WhatsApp + Email Services

---

## 🛠️ Tech Stack

| Layer          | Technology                |
| -------------- | ------------------------- |
| Frontend       | React, Vite, Tailwind CSS |
| Backend        | Node.js, Express.js       |
| Database       | MongoDB Atlas             |
| Authentication | JWT                       |
| AI             | Google Gemini             |
| Messaging      | Meta WhatsApp Cloud API   |
| Hosting        | Vercel + Railway          |
| PDFs           | PDFKit                    |

---

## 🚀 Local Setup

### Clone Repository

```bash
git clone https://github.com/yourusername/bizzrow.git
cd bizzrow
```

### Backend

```bash
cd server
npm install
npm run dev
```

For local development, set `NODE_ENV=development` and
`CLIENT_ORIGIN=http://localhost:5173` in the backend environment. Set
`VITE_API_URL=http://localhost:5000/api` in `client/.env.local`, or leave it
unset to use the frontend's local-backend default. The API listens on port 5000
by default. Local CORS explicitly allows Vite at `localhost:5173` and
`127.0.0.1:5173`; the production allowlist remains controlled by
`CLIENT_ORIGIN`. If you run Vite on a different local origin, add it to
`CLIENT_ORIGINS` as a comma-separated list while in development.

### Frontend

```bash
cd client
npm install
npm run dev
```

Open the frontend at `http://localhost:5173` so its browser origin matches the
local configuration.

### Product pricing migration

The migration script is read-only by default and reports how many legacy products
need wholesale, retail, or missing-cost values normalized. From the `server`
directory, run:

```bash
node scripts/migrateProductPricing.js
```

Review the dry-run output and ensure a database backup is available before
applying the changes explicitly:

```bash
node scripts/migrateProductPricing.js --apply
```

The script uses `MONGO_URI` from the server environment. It does not change stock
or sales records; the legacy `sellingPrice` field remains the wholesale alias.

---

## 🔐 Environment Variables

### Backend

```env
MONGO_URI=
JWT_SECRET=
GEMINI_API_KEY=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
# Development only: explicitly allow returning a reset link when SMTP is unavailable.
# NODE_ENV must be exactly "development" for this option to take effect.
EXPOSE_DEV_RESET_LINK=false
```

### Frontend

```env
VITE_API_URL=
```

---

## 📈 Product Evolution

SmartVyapaar

⬇

Thybizz

⬇

Bizzrow

Current Production Brand

---

## 🎯 Current Validation Stage

Bizzrow is currently being validated with real businesses including:

* Garment Businesses
* Hardware Stores
* FMCG Operations

Focus:

* Reduce Data Entry
* Improve Operational Visibility
* Simplify Daily Business Management

---

## 🗺️ Roadmap

### Completed

* Authentication
* Inventory
* Sales
* Ledger
* Analytics
* WhatsApp
* PDF Invoices
* OCR Engine
* Returns & Replacements

### Upcoming

* Advanced OCR Workflows
* Business Automation
* Enhanced Analytics
* Mobile Experience Improvements

---

## 💡 Vision

Bizzrow is not trying to become another ERP.

Our goal is simple:

> Become the easiest way for retailers and wholesalers to run their business.

---

## 👨‍💻 Founder

Kashif Ahmed

* Product Builder
* Entrepreneur
* Founder of Foxley
* Creator of Bizzrow

---

## 📜 License

MIT License
