require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/error");
const { createCorsOptions } = require("./utils/corsConfig");
const { configuredRateLimit, authRateLimits } = require("./middleware/rateLimit");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const customerRoutes = require("./routes/customers");
const ledgerRoutes = require("./routes/ledger");
const salesRoutes = require("./routes/sales");
const dashboardRoutes = require("./routes/dashboard");
const businessHealthRoutes = require("./routes/health");
const aiRoutes = require("./routes/ai");
const whatsappRoutes = require("./routes/whatsapp");
const settingsRoutes = require("./routes/settings");
const inventoryAuditRoutes = require("./routes/inventoryAudits");

const app = express();
if (process.env.TRUST_PROXY) {
  if (process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "*") {
    throw new Error("TRUST_PROXY must name trusted proxy addresses or subnets, not all proxies");
  }
  app.set("trust proxy", process.env.TRUST_PROXY.split(",").map((value) => value.trim()));
}

// --- Core middleware ---
app.use(cors(createCorsOptions()));
// Generous JSON limit to accommodate base64 images (product, logo, UPI QR, OCR invoice uploads)
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));

const authLimit = configuredRateLimit("AUTH", 30, 15 * 60 * 1000);
const recoveryLimit = configuredRateLimit("RECOVERY", 10, 15 * 60 * 1000);
const searchLimit = configuredRateLimit("SEARCH", 300, 60 * 1000);
const dashboardLimit = configuredRateLimit("DASHBOARD", 120, 60 * 1000);
const externalLimit = configuredRateLimit("EXTERNAL", 30, 60 * 1000);
// PDF generation is CPU-bound; limit per IP without blocking normal billing.
const pdfLimit = configuredRateLimit("PDF", 60, 60 * 1000);
app.use("/api/auth", authRateLimits(authLimit, recoveryLimit));
app.use(["/api/products", "/api/customers", "/api/sales"], (req, res, next) => {
  if (req.method === "GET" && req.path === "/" && req.query.q) return searchLimit(req, res, next);
  next();
});
app.use("/api/sales", (req, res, next) => {
  if (req.method === "GET" && /\/invoice\/pdf$/.test(req.path)) return pdfLimit(req, res, next);
  next();
});
app.use(["/api/dashboard", "/api/business-health"], dashboardLimit);
app.use(["/api/ai", "/api/whatsapp"], externalLimit);
app.use("/api/products/import/extract", externalLimit);

// --- Healthcheck ---
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "smartvyapaar-api", time: new Date().toISOString() });
});

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/business-health", businessHealthRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/inventory-audits", inventoryAuditRoutes);

// --- Error handlers ---
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

connectDB()
  .then(() => {
    app.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`✓ Bizzrow API listening on http://${HOST || "localhost"}:${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("✗ Failed to start server:", err.message);
    process.exit(1);
  });
