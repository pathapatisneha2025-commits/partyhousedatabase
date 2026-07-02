const express = require("express");
const router = express.Router();
const pool = require("../db");


// ---------- SEND CONTACT MESSAGE ----------
router.post("/send", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, email, subject, message]
    );

    res.json({
      message: "Message sent successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ---------- GET ALL MESSAGES (ADMIN) ----------
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM contact_messages ORDER BY id DESC`
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ---------- DELETE MESSAGE ----------
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM contact_messages WHERE id=$1`,
      [req.params.id]
    );

    res.json({ message: "Message deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;