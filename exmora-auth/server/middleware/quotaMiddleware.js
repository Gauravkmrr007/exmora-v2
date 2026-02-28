const Usage = require("../models/Usage");

const DAILY_LIMIT = 5;

const quotaMiddleware = async (req, res, next) => {
  try {
    const userId = req.userId; // Must be set by auth middleware
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Get today's date in YYYY-MM-DD
    const now = new Date();
    // Use string manipulation to construct local or UTC YYYY-MM-DD consistently
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    // Calculate resetAt timestamp: midnight of next day
    const resetAt = new Date(year, now.getMonth(), now.getDate() + 1).getTime();

    // Find and update usage atomically (thread-safe, race-condition safe for quota)
    const usage = await Usage.findOneAndUpdate(
      { userId, date: today },
      { $inc: { promptsUsed: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // If limits exceeded, reject and do not let request continue
    if (usage.promptsUsed > DAILY_LIMIT) {
      // Return 429
      return res.status(429).json({
        success: false,
        error: "Daily limit reached",
        remaining: 0,
        resetAt: resetAt,
      });
    }

    // Attach current usage to request for convenience in the route
    req.quota = {
      promptsUsed: usage.promptsUsed,
      remaining: Math.max(0, DAILY_LIMIT - usage.promptsUsed),
      limit: DAILY_LIMIT,
      resetAt: resetAt,
    };

    next();
  } catch (err) {
    console.error("Quota Middleware Error:", err);
    res.status(500).json({ success: false, error: "Internal server error enforcing quota" });
  }
};

module.exports = quotaMiddleware;
