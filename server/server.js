require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/error");

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

const app = express();

// --- Core middleware ---
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
// Generous JSON limit to accommodate base64 images (product, logo, UPI QR, OCR invoice uploads)
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));

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

// --- Error handlers ---
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`✓ Bizzrow API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("✗ Failed to start server:", err.message);
    process.exit(1);
  });
