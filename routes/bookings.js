const express = require("express");
const router = express.Router();
const pool = require("../db");
const nodemailer = require("nodemailer");
require("dotenv").config();
const { Resend } = require("resend");
const resendKey = process.env.RESEND_API_KEY?.trim();

console.log("====================================");
console.log("RESEND ENVIRONMENT DEBUG");
console.log("====================================");
console.log("KEY EXISTS:", !!resendKey);
console.log("KEY LENGTH:", resendKey ? resendKey.length : 0);
console.log(
  "KEY START:",
  resendKey ? resendKey.substring(0, 8) : "NONE"
);
console.log(
  "KEY END:",
  resendKey ? resendKey.substring(resendKey.length - 5) : "NONE"
);
console.log("====================================");

// Create Resend using the cleaned key
const resend = new Resend(resendKey);
// ======================= CREATE NEW BOOKING =======================
router.post("/add", async (req, res) => {
  try {
    const { name, email, phone, date, guests, message, service, room } = req.body;

    // Required fields check
    if (!name || !email || !phone || !date || !room) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if the room is already booked for this date
    const existingBooking = await pool.query(
      "SELECT * FROM bookings WHERE roomid=$1 AND event_date=$2",
      [room, date]
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({ error: "This room is already booked for the selected date" });
    }

    // Insert booking
    const result = await pool.query(
      `INSERT INTO bookings 
        (name, email, phone, event_date, guests, message, services, roomid)
       VALUES ($1, $2, $3, $4::DATE, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        email,
        phone,
        date,
        guests || null,
        message || null,
        service || null,
        room
      ]
    );

    res.json({ message: "Booking created", booking: result.rows[0] });

  } catch (err) {
    console.error("Booking add error:", err.message, err.stack);
    res.status(500).json({ error: "Server error" });
  }
});


// ======================= GET ALL BOOKINGS =======================
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bookings");
    res.json(result.rows);
  } catch (err) {
    console.error("Get all bookings error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================= GET SINGLE BOOKING =======================
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings WHERE id=$1",
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================= UPDATE BOOKING STATUS =======================
router.put("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  console.log("====================================");
  console.log("BOOKING STATUS UPDATE");
  console.log("Booking ID:", id);
  console.log("New Status:", status);
  console.log("====================================");

  try {
    // Check Resend API key
    console.log(
      "RESEND API KEY:",
      process.env.RESEND_API_KEY ? "FOUND" : "NOT FOUND"
    );

    // Update booking
    const result = await pool.query(
      "UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );

    console.log("Database update result:", result.rows);

    if (result.rows.length === 0) {
      console.log("❌ Booking not found");

      return res.status(404).json({
        error: "Booking not found",
      });
    }

    const booking = result.rows[0];

    // ================================
    // CONSOLE BOOKING EMAIL
    // ================================
    console.log("Customer Name:", booking.name);
    console.log("Customer Email:", booking.email);
    console.log("Booking Date:", booking.event_date);
    console.log("Booking Status:", booking.status);

    // Check email
    if (!booking.email) {
      console.log("❌ EMAIL IS EMPTY");

      return res.status(400).json({
        error: "Customer email is missing",
      });
    }

    // ================================
    // SEND EMAIL
    // ================================
    console.log("📧 Sending email to:", booking.email);

    const { data, error } = await resend.emails.send({
      from: "PartyHouse <onboarding@resend.dev>",
      to: [booking.email],
      subject: `Your Booking is ${status}`,
      html: `
        <h2>Hello ${booking.name}</h2>

        <p>
          Your booking for
          <b>${booking.event_date}</b>
          is now
          <b>${status}</b>.
        </p>
      `,
    });

    // ================================
    // RESEND RESPONSE
    // ================================
    console.log("📧 RESEND DATA:", data);
    console.log("❌ RESEND ERROR:", error);

    if (error) {
      console.error("❌ EMAIL FAILED");
      console.error(error);

      return res.status(500).json({
        error: "Email sending failed",
        resendError: error,
      });
    }

    console.log("✅ EMAIL SENT SUCCESSFULLY");
    console.log("Resend Email ID:", data?.id);

    console.log("====================================");

    return res.json({
      message: "Status updated & email sent",
      booking,
      email: {
        sentTo: booking.email,
        resendId: data?.id,
      },
    });

  } catch (err) {
    console.error("❌ STATUS UPDATE ERROR:");
    console.error(err);

    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
});

// ======================= UPDATE FULL BOOKING =======================
router.put("/update/:id", async (req, res) => {
  try {
    const { name, email, phone, date, guests, message, service, room } = req.body;

    if (!name || !email || !phone || !date || !room) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Optional: Check if the room is already booked for this date (excluding current booking)
    const existingBooking = await pool.query(
      "SELECT * FROM bookings WHERE roomId=$1 AND event_date=$2 AND id <> $3",
      [room, date, req.params.id]
    );
    if (existingBooking.rows.length > 0) {
      return res.status(400).json({ error: "This room is already booked for the selected date" });
    }

    const result = await pool.query(
      `UPDATE bookings
       SET name=$1, email=$2, phone=$3, event_date=$4, guests=$5, message=$6, services=$7, roomId=$8
       WHERE id=$9
       RETURNING *`,
      [name, email, phone, date, guests, message, service, room, req.params.id]
    );

    res.json({ message: "Booking updated", booking: result.rows[0] });

  } catch (err) {
    console.error("Update booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================= DELETE BOOKING =======================
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM bookings WHERE id=$1", [req.params.id]);
    res.json({ message: "Booking deleted successfully" });
  } catch (err) {
    console.error("Delete booking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;