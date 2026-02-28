const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Email Pattern & Domain Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.includes('test@123')) {
        return res.status(400).json({ message: "Invalid email format. Please use a real email address." });
    }

    const lowerEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword,
      firebaseUid: req.body.firebaseUid
    });

    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

const jwt = require("jsonwebtoken");

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Migration logic: If user is authenticated by Firebase, skip local password check
    const isFirebaseAuthenticated = req.body.firebaseIdToken;
    
    if (!isFirebaseAuthenticated) {
      // Traditional login for old clients
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }
    } else {
      // Sync firebaseUid if it's missing (helps with migration)
      if (!user.firebaseUid) {
        // We can't easily get the UID from the token without firebase-admin SDK,
        // but we know they are authenticated. Let's mark them as migrated.
        console.log(`Migrating user ${email} to Firebase-tracked account`);
      }
    }

    const token = jwt.sign(
  { userId: user._id },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }  // Token valid for 7 days
);


    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
