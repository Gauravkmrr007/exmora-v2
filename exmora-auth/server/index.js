require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");


const app = express();

// CORS configuration improved for production
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    // for production we can allow all, but with credentials we must be careful
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight OPTIONS requests explicitly
app.options('*', cors());

// Apply a lightweight IP-based rate limiter (e.g., 60 requests per minute per IP)
const ipRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 60, // Limit each IP to 60 requests per `window` (here, per 1 minute)
  standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after a minute"
  }
});
app.use(ipRateLimiter);

app.use(express.json());

// JSON Error Handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error("DEBUG: Malformed JSON received from client.");
    return res.status(400).json({ message: "Invalid JSON format. Check your request body." });
  }
  next();
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/protected", require("./routes/protected"));
app.use("/api/prompt", require("./routes/prompt"));




app.get("/", (req, res) => {
  res.send("Auth server running");
});

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI)

  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

