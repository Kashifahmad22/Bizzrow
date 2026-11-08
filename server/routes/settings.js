const express = require("express");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { protect } = require("../middleware/auth");
const { invoiceSettingsError } = require("../utils/invoiceTerms");
const { normalizeBankDetails } = require("../utils/bankDetails");

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
    const bankDetails = business && Object.prototype.hasOwnProperty.call(business, "bankDetails")
      ? normalizeBankDetails(business.bankDetails)
      : null;
    const settingsError = invoiceSettingsError(business);
    if (settingsError) {
      res.status(400);
      throw new Error(settingsError);
    }
    const user = await User.findById(req.user._id);
    if (business) {
      const currentBusiness = user.business.toObject?.() ?? user.business;
      user.business = {
        ...currentBusiness,
        ...business,
        ...(bankDetails && {
          bankDetails: {
            ...currentBusiness.bankDetails,
            ...bankDetails,
          },
        }),
      };
    }
    if (preferences) {
      user.preferences = { ...user.preferences.toObject?.() ?? user.preferences, ...preferences };
    }
    await user.save();
    res.json({ business: user.business, preferences: user.preferences });
  })
);

module.exports = router;
