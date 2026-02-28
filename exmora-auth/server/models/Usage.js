const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    promptsUsed: {
      type: Number,
      default: 0,
    },
    tokensUsed: {
      type: Number,
      default: 0,
    },
    uploadsUsed: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Compound unique index to ensure only one record per user per day
usageSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Usage", usageSchema);
