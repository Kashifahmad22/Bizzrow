const express = require("express");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

// GET /api/settings
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("-password");
    res.json({ business: user.business, preferences: user.preferences });
  })
);

// PUT /api/settings
router.put(
  "/",
  asyncHandler(async (req, res) => {
    const { business, preferences } = req.body;
    const user = await User.findById(req.user._id);
    if (business) {
      user.business = { ...user.business.toObject?.() ?? user.business, ...business };
    }
    if (preferences) {
      user.preferences = { ...user.preferences.toObject?.() ?? user.preferences, ...preferences };
    }
    await user.save();
    res.json({ business: user.business, preferences: user.preferences });
  })
);

module.exports = router;
