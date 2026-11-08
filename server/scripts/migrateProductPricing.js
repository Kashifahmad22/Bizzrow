const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Product = require("../models/Product");

const apply = process.argv.includes("--apply");
const BATCH_SIZE = 250;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required to inspect product pricing");

  await mongoose.connect(uri, { autoIndex: false });
  let scanned = 0;
  let wholesaleToSet = 0;
  let retailToSet = 0;
  let missingCostToNull = 0;
  let modified = 0;
  let operations = [];

  const flush = async () => {
    if (!apply || operations.length === 0) {
      operations = [];
      return;
    }
    const result = await Product.bulkWrite(operations, { ordered: false });
    modified += result.modifiedCount;
    operations = [];
  };

  const cursor = Product.find({})
    .select("_id sellingPrice wholesalePrice retailPrice costPrice")
    .cursor();
  for await (const product of cursor) {
    scanned += 1;
    const update = {};
    const wholesale = product.wholesalePrice ?? product.sellingPrice;
    if (product.wholesalePrice == null) {
      update.wholesalePrice = wholesale;
      wholesaleToSet += 1;
    }
    if (product.retailPrice == null) {
      update.retailPrice = Math.round(Number(wholesale || 0) * 200) / 100;
      retailToSet += 1;
    }
    if (product.costPrice == null) {
      update.costPrice = null;
      missingCostToNull += 1;
    }
    if (Object.keys(update).length) {
      operations.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: update },
        },
      });
    }
    if (operations.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scanned,
    wholesalePricesToSet: wholesaleToSet,
    retailPricesToSet: retailToSet,
    missingCostsSetToNull: missingCostToNull,
    modified,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("Product pricing migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
