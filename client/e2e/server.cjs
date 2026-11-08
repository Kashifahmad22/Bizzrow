const express = require("../../server/node_modules/express");
const cors = require("../../server/node_modules/cors");
const mongoose = require("../../server/node_modules/mongoose");
const { validateTestUri } = require("../../server/tests/helpers/isolatedMongo");
const { errorHandler, notFound } = require("../../server/middleware/error");
const { createCorsOptions } = require("../../server/utils/corsConfig");
const { protect } = require("../../server/middleware/auth");

async function main() {
  const uri = process.env.MONGO_URI;
  validateTestUri(uri);
  if (!process.env.E2E_SECRET || !/^bizzrow_e2e_[a-f0-9]{32}$/.test(process.env.E2E_SECRET)) {
    throw new Error("The isolated E2E runner must supply its synthetic secret");
  }
  if (!/^[a-f0-9]{64}$/.test(process.env.E2E_NONCE || "")) {
    throw new Error("The isolated E2E runner must supply its verification nonce");
  }
  process.env.JWT_SECRET = process.env.E2E_SECRET;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.isWritablePrimary || hello.setName !== "bizzrowTestRs" || hello.hosts.length !== 1) {
    throw new Error("Expected an isolated single-node test replica set");
  }
  const app = express();
  const whatsapp = require("../../server/services/whatsappService");
  whatsapp.sendInvoice = async () => ({ status: "disabled", error: "Disabled in isolated E2E" });
  app.use(cors(createCorsOptions()));
  app.use(express.json({ limit: "8mb" }));
  const allowed = [
    ["POST", /^\/api\/auth\/(register|login)$/],
    ["GET", /^\/api\/auth\/me$/],
    ["GET", /^\/api\/(customers|products|sales)$/],
    ["POST", /^\/api\/(customers|products|sales)$/],
    ["GET", /^\/api\/dashboard\/(summary|analytics)$/],
    ["GET", /^\/api\/ledger\/[a-f0-9]{24}$/],
    ["GET", /^\/api\/products\/[a-f0-9]{24}\/batches$/],
    ["POST", /^\/api\/products\/[a-f0-9]{24}\/batches$/],
    ["GET", /^\/api\/sales\/[a-f0-9]{24}(\/(invoice|returns))?$/],
    ["POST", /^\/api\/sales\/[a-f0-9]{24}\/(return|replace)$/],
  ];
  app.use((req, res, next) => {
    if (req.path === "/health" || (req.path === "/fixture/historical" && req.method === "POST")
        || allowed.some(([method, pattern]) => req.method === method && pattern.test(req.path))) return next();
    return res.status(403).json({ message: "Endpoint disabled in isolated E2E" });
  });
  app.post("/fixture/historical", protect, async (req, res, next) => {
    try {
      if (req.get("X-E2E-Nonce") !== process.env.E2E_NONCE) return res.sendStatus(403);
      const Customer = require("../../server/models/Customer");
      const Product = require("../../server/models/Product");
      const StockBatch = require("../../server/models/StockBatch");
      const Sale = require("../../server/models/Sale");
      const customer = await Customer.findOne({ _id: req.body.customerId, owner: req.user._id });
      if (!customer) return res.sendStatus(404);
      const product = await Product.create({ owner: req.user._id, name: "Historical Fraction", sellingPrice: 100, stock: 0.76544, soldCount: 1.23456 });
      const batch = await StockBatch.create({
        owner: req.user._id, product: product._id, batchCode: "historic", purchaseDate: new Date("2023-01-01"),
        quantityReceived: 2, remainingQuantity: 0.76544,
      });
      const sale = await Sale.create({
        owner: req.user._id, customer: customer._id, customerName: customer.name,
        total: 123.46, amountPaid: 123.46, dueAmount: 0, customerType: "existing", saleType: "wholesale",
        paymentMethod: "cash", payments: [{ method: "cash", amount: 123.46 }],
        items: [{ product: product._id, name: product.name, quantity: 1.23456, unitPrice: 100,
          subtotal: 123.46, batchAllocations: [{ batch: batch._id, quantity: 1.23456 }] }],
      });
      res.status(201).json({ saleId: sale._id, productId: product._id });
    } catch (error) {
      next(error);
    }
  });
  for (const name of ["auth", "products", "customers", "ledger", "sales", "dashboard"]) {
    app.use(`/api/${name}`, require(`../../server/routes/${name}`));
  }
  app.get("/health", (_req, res) => res.json({ nonce: process.env.E2E_NONCE }));
  app.use(notFound);
  app.use(errorHandler);
  app.listen(Number(process.env.E2E_API_PORT), "127.0.0.1");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
