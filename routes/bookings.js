const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const nodemailer = require("nodemailer");

// ======================================================
// GMAIL SMTP CONFIGURATION
// ======================================================

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Optional startup check
if (!process.env.EMAIL_USER) {
  console.error("EMAIL_USER is missing");
}

if (!process.env.EMAIL_APP_PASSWORD) {
  console.error("EMAIL_APP_PASSWORD is missing");
}


// ======================================================
// CREATE NEW BOOKING
// ======================================================

router.post("/add", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      date,
      guests,
      message,
      service,
      room
    } = req.body;

    if (!name || !email || !phone || !date || !room) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    // Check if room is already booked for this date
    const existingBooking = await pool.query(
      `SELECT *
       FROM bookings
       WHERE roomid = $1
       AND event_date = $2`,
      [room, date]
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({
        error: "This room is already booked for the selected date"
      });
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

    res.json({
      message: "Booking created",
      booking: result.rows[0]
    });

  } catch (err) {
    console.error(
      "Booking add error:",
      err.message,
      err.stack
    );

    res.status(500).json({
      error: "Server error"
    });
  }
});


// ======================================================
// GET ALL BOOKINGS
// ======================================================

router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings"
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Get all bookings error:", err);

    res.status(500).json({
      error: "Server error"
    });
  }
});


// ======================================================
// GET SINGLE BOOKING
// ======================================================

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings WHERE id=$1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Get booking error:", err);

    res.status(500).json({
      error: "Server error"
    });
  }
});


// ======================================================
// UPDATE BOOKING STATUS + SEND EMAIL
// ======================================================

router.put("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {

    if (!status) {
      return res.status(400).json({
        error: "Status is required"
      });
    }

    // ------------------------------------------
    // UPDATE DATABASE
    // ------------------------------------------

    const result = await pool.query(
      `UPDATE bookings
       SET status=$1
       WHERE id=$2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    const booking = result.rows[0];


    // ------------------------------------------
    // CHECK EMAIL CONFIGURATION
    // ------------------------------------------

    if (!process.env.EMAIL_USER) {

      console.error("EMAIL_USER is missing");

      return res.status(500).json({
        error: "EMAIL_USER is not configured",
        booking
      });
    }

    if (!process.env.EMAIL_APP_PASSWORD) {

      console.error("EMAIL_APP_PASSWORD is missing");

      return res.status(500).json({
        error: "EMAIL_APP_PASSWORD is not configured",
        booking
      });
    }


    // ------------------------------------------
    // SEND EMAIL
    // ------------------------------------------

    const mailOptions = {

      from: {
        name: "PartyHouse",
        address: process.env.EMAIL_USER
      },

      to: booking.email,

      subject: `Your PartyHouse Booking is ${status}`,

      text: `
Hello ${booking.name},

Your PartyHouse booking has been updated.

Booking Date: ${booking.event_date}

Status: ${status}

Phone: ${booking.phone}

Thank you for choosing PartyHouse.
      `,

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: auto;
          padding: 25px;
          border: 1px solid #ddd;
          border-radius: 10px;
          background: #ffffff;
        ">

          <h2 style="
            color: #f97316;
            margin-bottom: 20px;
          ">
            PartyHouse Booking Update
          </h2>

          <p>
            Hello
            <strong>${booking.name}</strong>,
          </p>

          <p>
            Your PartyHouse booking status has been updated.
          </p>

          <div style="
            background: #f8f8f8;
            padding: 18px;
            border-radius: 8px;
            margin: 20px 0;
          ">

            <p>
              <strong>Booking Date:</strong>
              ${booking.event_date}
            </p>

            <p>
              <strong>Status:</strong>
              ${status}
            </p>

            <p>
              <strong>Phone:</strong>
              ${booking.phone}
            </p>

            <p>
              <strong>Guests:</strong>
              ${booking.guests || "Not specified"}
            </p>

          </div>

          <p>
            Thank you for choosing
            <strong>PartyHouse</strong>.
          </p>

          <p style="
            color: #777;
            font-size: 13px;
          ">
            This is an automated email. Please do not reply directly
            to this message.
          </p>

        </div>
      `
    };


    try {

      const info = await transporter.sendMail(mailOptions);

      console.log(
        "===================================="
      );

      console.log(
        "EMAIL SENT SUCCESSFULLY"
      );

      console.log(
        "To:",
        booking.email
      );

      console.log(
        "Message ID:",
        info.messageId
      );

      console.log(
        "====================================");


    } catch (emailError) {

      console.error(
        "===================================="
      );

      console.error(
        "GMAIL EMAIL ERROR"
      );

      console.error(
        emailError.message
      );

      console.error(
        "===================================="
      );

      // Booking status was already updated
      return res.status(200).json({
        message: "Booking status updated, but email could not be sent",
        booking,
        emailError: emailError.message
      });
    }


    // ------------------------------------------
    // SUCCESS
    // ------------------------------------------

    res.json({
      message: "Status updated & email sent",
      booking
    });

  } catch (err) {

    console.error(
      "Status update error:",
      err.message,
      err.stack
    );

    res.status(500).json({
      error: "Server error"
    });
  }
});


// ======================================================
// UPDATE FULL BOOKING
// ======================================================

router.put("/update/:id", async (req, res) => {

  try {

    const {
      name,
      email,
      phone,
      date,
      guests,
      message,
      service,
      room
    } = req.body;

    if (!name || !email || !phone || !date || !room) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    // Check duplicate room/date
    const existingBooking = await pool.query(
      `SELECT *
       FROM bookings
       WHERE roomid=$1
       AND event_date=$2
       AND id <> $3`,
      [
        room,
        date,
        req.params.id
      ]
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({
        error: "This room is already booked for the selected date"
      });
    }

    const result = await pool.query(
      `UPDATE bookings
       SET
         name=$1,
         email=$2,
         phone=$3,
         event_date=$4,
         guests=$5,
         message=$6,
         services=$7,
         roomid=$8
       WHERE id=$9
       RETURNING *`,
      [
        name,
        email,
        phone,
        date,
        guests || null,
        message || null,
        service || null,
        room,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    res.json({
      message: "Booking updated",
      booking: result.rows[0]
    });

  } catch (err) {

    console.error(
      "Update booking error:",
      err.message,
      err.stack
    );

    res.status(500).json({
      error: "Server error"
    });
  }
});


// ======================================================
// DELETE BOOKING
// ======================================================

router.delete("/delete/:id", async (req, res) => {

  try {

    const result = await pool.query(
      "DELETE FROM bookings WHERE id=$1 RETURNING *",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    res.json({
      message: "Booking deleted successfully"
    });

  } catch (err) {

    console.error(
      "Delete booking error:",
      err.message,
      err.stack
    );

    res.status(500).json({
      error: "Server error"
    });
  }
});


module.exports = router;