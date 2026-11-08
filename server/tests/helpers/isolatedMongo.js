const crypto = require("node:crypto");
const mongoose = require("mongoose");

function validateTestUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("FINANCIAL_TEST_MONGO_URI must be a valid loopback MongoDB URI");
  }
  if (parsed.protocol !== "mongodb:"
      || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname.toLowerCase())
      || parsed.pathname !== "/bizzrow_test"
      || parsed.searchParams.get("directConnection") !== "true"
      || !parsed.searchParams.get("replicaSet")) {
    throw new Error("Test URI must target loopback, database bizzrow_test, directConnection=true and an explicit replicaSet");
  }
  const allowed = new Set(["directConnection", "replicaSet", "authSource"]);
  const options = [...parsed.searchParams.keys()];
  if (options.some((option) => !allowed.has(option)) || new Set(options).size !== options.length
      || (parsed.username && parsed.username !== "bizzrow_test")
      || (!parsed.username && parsed.password)
      || (parsed.searchParams.has("authSource") && !["admin", "bizzrow_test"].includes(parsed.searchParams.get("authSource")))) {
    throw new Error("Test URI contains unsupported options or credentials; use the dedicated bizzrow_test user");
  }
  return parsed;
}

async function connectIsolatedMongo(uri, models) {
  validateTestUri(uri);
  const dbName = `bizzrow_test_${crypto.randomUUID().replace(/-/g, "")}`;
  try {
    await mongoose.connect(uri, { dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
    const connection = mongoose.connection;
    const hello = await connection.db.admin().command({ hello: 1 });
    if (connection.name !== dbName || !["localhost", "127.0.0.1", "::1"].includes(connection.host)
        || hello.setName !== validateTestUri(uri).searchParams.get("replicaSet")
        || !hello.isWritablePrimary || hello.hosts?.length !== 1
        || hello.passives?.length || hello.arbiters?.length) {
      throw new Error("Test connection is not the expected single-node writable replica-set primary");
    }
    if ((await connection.db.listCollections({}, { nameOnly: true }).toArray()).length) {
      throw new Error("Generated test database is not empty");
    }
    for (const model of models) {
      await model.createCollection();
      await model.createIndexes();
      const actual = await model.collection.indexes();
      if (!actual.some((index) => index.name === "_id_" && index.key._id === 1)) {
        throw new Error(`Missing unique _id index on ${model.modelName}`);
      }
      for (const [keys, options] of model.schema.indexes()) {
        const found = actual.some((index) => JSON.stringify(index.key) === JSON.stringify(keys)
          && (!options.unique || index.unique === true));
        if (!found) throw new Error(`Missing expected index on ${model.modelName}: ${JSON.stringify(keys)}`);
      }
    }
    return dbName;
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }
}

module.exports = { validateTestUri, connectIsolatedMongo };
