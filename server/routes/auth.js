const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const mailer = require("../services/mailer");

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function publicUser(u) {
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    business: u.business,
    preferences: u.preferences,
    createdAt: u.createdAt,
  };
}

// POST /api/auth/register
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, businessName } = req.body;
    if (!name || !email || !password) {
      res.status(400);
      throw new Error("name, email and password are required");
    }
    if (password.length < 6) {
      res.status(400);
      throw new Error("Password must be at least 6 characters");
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409);
      throw new Error("An account with that email already exists");
    }
    const user = await User.create({
      name,
      email,
      password,
      business: { name: businessName || `${name}'s Shop` },
    });
    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error("email and password are required");
  }
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error("Invalid credentials");
  }
  res.json({ token: signToken(user._id), user: publicUser(user) });
})
);

// GET /api/auth/me
router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

// POST /api/auth/forgot-password — issue a reset link (always returns a generic message)
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400);
      throw new Error("email is required");
    }
    const generic = { message: "If an account exists for that email, a password reset link has been sent." };
    const user = await User.findOne({ email: String(email).toLowerCase() });
    // Do not reveal whether the email exists.
    if (!user) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetTokenHash = hashToken(rawToken);
    user.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const base = (process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
    const link = `${base}/reset-password?token=${rawToken}`;

    const resp = { ...generic };
    try {
      if (mailer.isConfigured()) {
        await mailer.sendResetEmail({ to: user.email, link, businessName: user.business?.name });
      } else {
        // SMTP not configured — log the link so the flow still works in dev/staging.
        // eslint-disable-next-line no-console
        console.log(`[forgot-password] SMTP not configured. Reset link for ${user.email}: ${link}`);
        if (process.env.NODE_ENV !== "production") resp.devLink = link;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[forgot-password] email send failed:", err.message);
      if (process.env.NODE_ENV !== "production") resp.devLink = link;
    }
    res.json(resp);
  })
);

// POST /api/auth/reset-password — consume a one-time token and set a new password
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400);
      throw new Error("token and password are required");
    }
    if (password.length < 6) {
      res.status(400);
      throw new Error("Password must be at least 6 characters");
    }
    const user = await User.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      res.status(400);
      throw new Error("This reset link is invalid or has expired. Please request a new one.");
    }
    user.password = password; // pre-save hook re-hashes
    user.resetTokenHash = ""; // one-time use
    user.resetTokenExpiresAt = undefined;
    await user.save();
    // Auto-login on success.
    res.json({ token: signToken(user._id), user: publicUser(user) });
  })
);

module.exports = router;
