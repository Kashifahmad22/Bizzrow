const express = require("express");

function positiveInteger(value, name) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

function rateLimit({ limit, windowMs, maxKeys = 10000, now = Date.now }) {
  positiveInteger(limit, "limit");
  positiveInteger(windowMs, "windowMs");
  const entries = new Map();
  return (req, res, next) => {
    const time = now();
    const key = req.ip;
    let entry = entries.get(key);
    if (!entry || entry.until <= time) {
      if (entries.size >= maxKeys) {
        for (const [oldKey, old] of entries) if (old.until <= time) entries.delete(oldKey);
        if (entries.size >= maxKeys && !entries.has(key)) {
          res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
          return res.status(429).json({ message: "Too many requests. Please retry later." });
        }
      }
      entry = { count: 0, until: time + windowMs };
      entries.set(key, entry);
    }
    if (entry.count >= limit) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((entry.until - time) / 1000))));
      return res.status(429).json({ message: "Too many requests. Please retry later." });
    }
    entry.count += 1;
    next();
  };
}

function configuredRateLimit(name, defaultLimit, defaultWindowMs, env = process.env) {
  return rateLimit({
    limit: positiveInteger(env[`RATE_LIMIT_${name}_MAX`] || defaultLimit, `RATE_LIMIT_${name}_MAX`),
    windowMs: positiveInteger(env[`RATE_LIMIT_${name}_WINDOW_MS`] || defaultWindowMs, `RATE_LIMIT_${name}_WINDOW_MS`),
  });
}

function authRateLimits(authLimit, recoveryLimit) {
  const router = express.Router();
  router.post(["/login", "/register"], authLimit);
  router.post(["/forgot-password", "/reset-password"], recoveryLimit);
  return router;
}

module.exports = { rateLimit, configuredRateLimit, authRateLimits };
