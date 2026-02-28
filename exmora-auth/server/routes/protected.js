const express = require("express");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/test", auth, (req, res) => {
  res.json({
    message: "Protected route accessed",
    userId: req.userId
  });
});

module.exports = router;
