require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");


const app = express();

// 1. Manually add CORS headers to ALL responses as the very first middleware
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://exmora-ai.netlify.app',
    'https://exmora-v2.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
  ];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin) || (origin && origin.endsWith('netlify.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 2. Also keep the cors middleware as a backup
app.use(cors({
  origin: true,
  credentials: true
}));

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

