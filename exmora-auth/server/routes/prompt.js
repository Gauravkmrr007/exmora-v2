const express = require("express");
const auth = require("../middleware/authMiddleware");
const quotaMiddleware = require("../middleware/quotaMiddleware");
const User = require("../models/User");

const router = express.Router();

// Apply auth first, then quotaMiddleware before the handler
router.post("/ask", auth, quotaMiddleware, async (req, res) => {
  try {
    // The quota is already checked and incremented in quotaMiddleware.
    // If we reached this handler, the quota limit was not exceeded.
    
    // Actual prompt generation logic would go here
    
    res.json({
      success: true,
      message: "Prompt accepted",
      remaining: req.quota.remaining,
      resetAt: req.quota.resetAt
    });
  } catch (err) {
    console.error("Prompt handler error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
