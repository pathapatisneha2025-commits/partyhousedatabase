const express = require("express");
const router = express.Router();
const pool = require("../db");
const nodemailer = require("nodemailer");
require("dotenv").config();
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

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

  try {
    // 1. Update booking status
    const result = await pool.query(
      "UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    const booking = result.rows[0];

    console.log("====================================");
    console.log("BOOKING STATUS UPDATE");
    console.log("Booking ID:", id);
    console.log("New Status:", status);
    console.log("Customer Email:", booking.email);
    console.log(
      "RESEND KEY EXISTS:",
      !!process.env.RESEND_API_KEY
    );
    console.log("====================================");

    // 2. Send email through Resend
    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "prasad.nhz.jp@gmail.com",
      subject: `Your Booking is ${status}`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Hello ${booking.name},</h2>

          <p>
            Your booking for
            <strong>${booking.event_date}</strong>
            is now
            <strong>${status}</strong>.
          </p>

          <p>
            Thank you for choosing Party House.
          </p>
        </div>
      `,
    });

    // 3. Check Resend response
    if (error) {
      console.error("====================================");
      console.error("RESEND EMAIL ERROR");
      console.error(error);
      console.error("====================================");

      return res.status(500).json({
        error: "Booking status updated, but email failed",
        resendError: error,
        booking,
      });
    }

    console.log("====================================");
    console.log("EMAIL SENT TO RESEND");
    console.log("Resend Response:", data);
    console.log("====================================");

    // 4. Success
    res.json({
      message: "Status updated & email sent",
      booking,
      email: {
        sent: true,
        resendId: data?.id,
      },
    });

  } catch (err) {
    console.error("====================================");
    console.error("STATUS UPDATE ERROR");
    console.error(err);
    console.error("====================================");

    res.status(500).json({
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