const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const RevokedSession = require("../models/RevokedSession");
const { tokenVersionMatches } = require("../utils/tokenVersion");

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function authenticate(req, res, next, allowRevoked) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      res.status(401);
      throw new Error("Not authorized — missing token");
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      res.status(401);
      throw new Error("Not authorized — user no longer exists");
    }
    if (!tokenVersionMatches(decoded.tokenVersion, user.tokenVersion)) {
      res.status(401);
      throw new Error("Not authorized — session has been revoked");
    }
    if (!allowRevoked && await RevokedSession.exists({ owner: user._id, tokenHash: hashSessionToken(token) })) {
      res.status(401);
      throw new Error("Not authorized — session has been revoked");
    }
    req.user = user;
    req.sessionToken = token;
    req.sessionClaims = decoded;
    next();
  } catch (err) {
    if (!res.statusCode || res.statusCode < 400) {
      res.status(err.name === "JsonWebTokenError" || err.name === "TokenExpiredError"
        || err.name === "NotBeforeError" ? 401 : 503);
    }
    next(err);
  }
}

function protect(req, res, next) {
  return authenticate(req, res, next, false);
}

function protectLogout(req, res, next) {
  return authenticate(req, res, next, true);
}

module.exports = { protect, protectLogout, hashSessionToken };
