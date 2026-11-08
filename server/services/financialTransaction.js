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

function resourceIdempotency({ resourceId, operation, fingerprintOperation, parameter, body }) {
  if (typeof resourceId !== "string" || !/^[0-9a-f]{24}$/i.test(resourceId)) {
    throw httpError(400, "Invalid resource ID");
  }
  const canonicalId = resourceId.toLowerCase();
  return {
    resourceId: canonicalId,
    operation: `${operation}:${canonicalId}`,
    fingerprint: requestFingerprint(fingerprintOperation, { [parameter]: canonicalId }, body),
    resource: { id: canonicalId, operation, fingerprintOperation, parameter, body },
  };
}

function resourceIdentityPattern(ownerId, key, resource) {
  const escaped = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const identity = idempotencyIdentity(ownerId, `${resource.operation}:${resource.id}`, key);
  const prefix = `idempotency:${resource.operation}:`;
  const suffix = identity.slice(prefix.length + resource.id.length);
  const idPattern = [...resource.id].map((c) => /[a-f]/.test(c) ? `[${c}${c.toUpperCase()}]` : c).join("");
  return new RegExp(`^${escaped(prefix)}${idPattern}${escaped(suffix)}$`);
}

async function findResourceRecord(ownerId, key, resource, session) {
  let query = Counter.find({ _id: resourceIdentityPattern(ownerId, key, resource) }).limit(2);
  if (session) query = query.session(session);
  const records = await query;
  if (records.length > 1) {
    throw httpError(409, "Multiple historical idempotency records exist for this resource and key; manual review is required");
  }
  return records[0];
}

function checkResourceFingerprint(record, fingerprint, resource) {
  const prefix = `idempotency:${resource.operation}:`;
  const originalId = record._id.slice(prefix.length, prefix.length + 24);
  const legacyFingerprint = requestFingerprint(resource.fingerprintOperation, { [resource.parameter]: originalId }, resource.body);
  if (record.requestHash !== fingerprint && record.requestHash !== legacyFingerprint) {
    throw httpError(409, "Idempotency-Key was already used for a different request");
  }
}

async function executeIdempotently({ ownerId, operation, key, fingerprint, resource, prepare, work, replay, replaySnapshot }) {
  const identity = idempotencyIdentity(ownerId, operation, key);
  const findExisting = (session) => resource
    ? findResourceRecord(ownerId, key, resource, session)
    : session ? Counter.findById(identity).session(session) : Counter.findById(identity);
  const checkExisting = (record) => {
    if (resource) checkResourceFingerprint(record, fingerprint, resource);
    else if (record.requestHash !== fingerprint) {
      throw httpError(409, "Idempotency-Key was already used for a different request");
    }
  };
  const replayResult = (record) => {
    if (record.responseSnapshot !== undefined) {
      return replaySnapshot ? replaySnapshot(record.responseSnapshot) : record.responseSnapshot;
    }
    return replay(record);
  };
  let outcome;
  try {
    outcome = await runFinancialTransaction(async (session) => {
      const existing = await findExisting(session);
      if (existing) {
        checkExisting(existing);
        return { replayed: true, record: existing };
      }

      const prepared = prepare ? await prepare(session) : undefined;
      const [record] = await Counter.create([{
        _id: identity,
        seq: 0,
        requestHash: fingerprint,
      }], { session });
      const result = await work(session, prepared);
      record.resultType = result.resultType;
      record.resultId = result.resultId;
      record.relatedResourceId = result.relatedResourceId || null;
      record.responseSnapshot = JSON.parse(JSON.stringify(result.value));
      await record.save({ session });
      return { replayed: false, value: result.value };
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await findExisting();
    if (!existing) throw error;
    checkExisting(existing);
    return replayResult(existing);
  }

  if (outcome.replayed) return replayResult(outcome.record);
  return outcome.value;
}

module.exports = {
  executeIdempotently,
  idempotencyIdentity,
  isUnsupportedTransactionError,
  requestFingerprint,
  requireIdempotencyKey,
  resourceIdempotency,
  runFinancialTransaction,
};
