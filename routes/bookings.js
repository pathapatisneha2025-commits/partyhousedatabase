const express = require("express");
const router = express.Router();
const pool = require("../db");
const nodemailer = require("nodemailer");  // ✅ ADD THIS
require("dotenv").config();                // ✅ REQUIRED for .env
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
// CREATE NEW BOOKING
router.post("/add", async (req, res) => {
  try {
    const { name, email, phone, date, guests, message } = req.body;

    if (!name || !email || !phone || !date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO bookings (name, email, phone, event_date, guests, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, email, phone, date, guests, message]
    );

    res.json({ message: "Booking created", booking: result.rows[0] });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: GET ALL BOOKINGS
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM bookings`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: GET SINGLE BOOKING
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM bookings WHERE id = $1`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: UPDATE BOOKING STATUS ONLY

router.put("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query(
      "UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = result.rows[0];

    const email = await resend.emails.send({
      from: "PartyHouse <onboarding@resend.dev>",
      to: booking.email,
      subject: `Your Booking is ${status}`,
      html: `
        <h2>Hello ${booking.name},</h2>
        <p>Your booking for <b>${booking.event_date}</b> is now <b>${status}</b>.</p>
      `,
    });

    console.log("Email sent:", email);
    res.json({ message: "Status updated & email sent", booking });

  } catch (error) {
    console.error("Resend error:", error);
    res.status(500).json({ error: "Server error" });
  }
});



// ✅ ADMIN: UPDATE FULL BOOKING DETAILS
router.put("/update/:id", async (req, res) => {
  try {
    const { name, email, phone, date, guests, message } = req.body;

    const result = await pool.query(
      `UPDATE bookings 
       SET name = $1, email = $2, phone = $3, event_date = $4, guests = $5, message = $6
       WHERE id = $7
       RETURNING *`,
      [name, email, phone, date, guests, message, req.params.id]
    );

    res.json({ message: "Booking updated", booking: result.rows[0] });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ ADMIN: DELETE BOOKING
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM bookings WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: "Booking deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
