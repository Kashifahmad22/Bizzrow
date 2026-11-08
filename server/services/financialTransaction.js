const crypto = require("crypto");
const mongoose = require("mongoose");
const Counter = require("../models/Counter");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isUnsupportedTransactionError(error) {
  const message = String(error?.message || "");
  return error?.code === 20
    || error?.codeName === "IllegalOperation"
    || /Transaction numbers are only allowed|does not support transactions|replica set/i.test(message);
}

async function runFinancialTransaction(callback) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (error) {
    if (isUnsupportedTransactionError(error)) {
      throw httpError(503, "Financial writes require MongoDB replica-set transaction support");
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function idempotencyIdentity(ownerId, operation, key) {
  const keyHash = crypto.createHash("sha256").update(String(key)).digest("hex");
  return `idempotency:${operation}:${ownerId}:${keyHash}`;
}

function requestFingerprint(operation, params, body) {
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, Object.create(null));
    }
    return value;
  }
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize({ operation, params, body })))
    .digest("hex");
}

function requireIdempotencyKey(req) {
  const key = String(req.get("Idempotency-Key") || "").trim();
  if (key.length < 8 || key.length > 200) {
    throw httpError(400, "A valid Idempotency-Key header (8–200 characters) is required");
  }
  return key;
}

async function executeIdempotently({ ownerId, operation, key, fingerprint, work, replay }) {
  const identity = idempotencyIdentity(ownerId, operation, key);
  let outcome;
  try {
    outcome = await runFinancialTransaction(async (session) => {
      const existing = await Counter.findById(identity).session(session);
      if (existing) {
        if (existing.requestHash !== fingerprint) {
          throw httpError(409, "Idempotency-Key was already used for a different request");
        }
        return { replayed: true, record: existing };
      }

      const [record] = await Counter.create([{
        _id: identity,
        seq: 0,
        requestHash: fingerprint,
      }], { session });
      const result = await work(session);
      record.resultType = result.resultType;
      record.resultId = result.resultId;
      record.relatedResourceId = result.relatedResourceId || null;
      await record.save({ session });
      return { replayed: false, value: result.value };
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await Counter.findById(identity);
    if (!existing) throw error;
    if (existing.requestHash !== fingerprint) {
      throw httpError(409, "Idempotency-Key was already used for a different request");
    }
    return replay(existing);
  }

  if (outcome.replayed) return replay(outcome.record);
  return outcome.value;
}

module.exports = {
  executeIdempotently,
  idempotencyIdentity,
  isUnsupportedTransactionError,
  requestFingerprint,
  requireIdempotencyKey,
  runFinancialTransaction,
};
