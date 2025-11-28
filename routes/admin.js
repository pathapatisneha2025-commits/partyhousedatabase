const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");


// =========================
// REGISTER ADMIN
// =========================
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;

    // Basic validation
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    // Check if email already exists
    const emailCheck = await pool.query(
      "SELECT * FROM admins WHERE email = $1",
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert into database
    await pool.query(
      `INSERT INTO admins (name, email, phone, password) 
       VALUES ($1, $2, $3, $4)`,
      [name, email, phone, hash]
    );

    res.json({ message: "Admin registered successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});



// =========================
// LOGIN ADMIN (SESSION BASED)
// =========================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get admin by email
    const result = await pool.query(
      "SELECT * FROM admins WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Compare password
    const valid = await bcrypt.compare(password, result.rows[0].password);

    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Successful login
    res.json({
      message: "Login successful",
      admin: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        email: result.rows[0].email,
        phone: result.rows[0].phone
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// =========================
// GET ALL ADMINS
// =========================
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM admins ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// CHECK LOGIN
// =========================
router.get("/check", (req, res) => {
  if (req.session.adminId) {
    return res.json({ loggedIn: true });
  }
  res.json({ loggedIn: false });
});


// =========================
// LOGOUT
// =========================

router.post("/logout", (req, res) => {
  // No session to destroy, just return success
  res.json({ message: "Logged out successfully" });
});




module.exports = router;
