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

The web client persists the pending key per tab and endpoint, reuses it only for
the same request payload, and keeps failed transaction forms available for retry.
To start a changed request after a failure, explicitly discard the pending
attempt first.

These financial writes require a MongoDB replica set or sharded cluster with
transaction support. The API returns an error rather than writing partially if
transactions are unavailable.

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
