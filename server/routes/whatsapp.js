const express = require("express");
const WhatsAppLog = require("../models/WhatsAppLog");
const Customer = require("../models/Customer");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const whatsapp = require("../services/whatsappService");

const router = express.Router();
router.use(protect);

// GET /api/whatsapp/logs
router.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const logs = await WhatsAppLog.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ logs });
  })
);

// POST /api/whatsapp/broadcast { customerIds?, body, mediaUrl? }
// If customerIds omitted, broadcast to ALL customers.
router.post(
  "/broadcast",
  asyncHandler(async (req, res) => {
    const { customerIds, body, mediaUrl } = req.body;
    if (!body || !body.trim()) {
      res.status(400);
      throw new Error("Message body is required");
    }
    const query = { owner: req.user._id };
    if (Array.isArray(customerIds) && customerIds.length > 0) {
      query._id = { $in: customerIds };
    }
    const customers = await Customer.find(query);
    if (customers.length === 0) {
      res.status(400);
      throw new Error("No customers to broadcast to");
    }
    const result = await whatsapp.sendBroadcast({
      owner: req.user._id,
      customers,
      body,
      mediaUrl,
    });
    res.json(result);
  })
);

// POST /api/whatsapp/test — send a real test message to a free-form phone
router.post(
  "/test",
  asyncHandler(async (req, res) => {
    const { to, body } = req.body;
    if (!to || !body) {
      res.status(400);
      throw new Error("to and body are required");
    }
    const result = await whatsapp.sendText({
      owner: req.user._id,
      to,
      body,
      type: "custom",
    });
    res.json(result);
  })
);

module.exports = router;
