/**
 * Mailer service (Sprint 1 — Forgot Password).
 *
 * SMTP via nodemailer, configured by env:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for 465),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM (default "Bizzrow <SMTP_USER>")
 *
 * If SMTP is not configured, callers fall back gracefully (the auth route logs
 * the reset link instead of throwing), so the feature never breaks production.
 */

const nodemailer = require("nodemailer");

let _transport = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport() {
  if (_transport) return _transport;
  const port = Number(process.env.SMTP_PORT || 587);
  _transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transport;
}

async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || `Bizzrow <${process.env.SMTP_USER}>`;
  return transport().sendMail({ from, to, subject, html, text });
}

async function sendResetEmail({ to, link, businessName }) {
  const brand = businessName || "Bizzrow";
  const subject = `Reset your ${brand} password`;
  const text =
    `We received a request to reset your ${brand} password.\n\n` +
    `Reset link (valid for 1 hour):\n${link}\n\n` +
    `If you didn't request this, you can safely ignore this email.`;
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#161a2b">
    <div style="font-weight:800;font-size:20px;color:#3849f5;margin-bottom:8px">${brand}</div>
    <h2 style="font-size:18px;margin:16px 0 8px">Reset your password</h2>
    <p style="color:#525a72;font-size:14px;line-height:1.5">
      We received a request to reset your password. This link is valid for <b>1 hour</b> and can be used once.
    </p>
    <a href="${link}" style="display:inline-block;margin:16px 0;background:#3849f5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">Reset password</a>
    <p style="color:#7a8198;font-size:12px;line-height:1.5">
      If the button doesn't work, paste this link into your browser:<br>
      <span style="word-break:break-all;color:#3849f5">${link}</span>
    </p>
    <p style="color:#a8b0c4;font-size:12px;margin-top:24px">If you didn't request this, you can ignore this email.</p>
  </div>`;
  return sendMail({ to, subject, html, text });
}

module.exports = { isConfigured, sendMail, sendResetEmail };
