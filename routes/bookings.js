const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const nodemailer = require("nodemailer");

// ======================================================
// GMAIL SMTP CONFIGURATION
// ======================================================

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

console.log("====================================");
console.log("EMAIL CONFIGURATION");
console.log("EMAIL_USER:", EMAIL_USER || "MISSING");
console.log(
  "EMAIL_APP_PASSWORD EXISTS:",
  !!EMAIL_APP_PASSWORD
);
console.log(
  "EMAIL_APP_PASSWORD LENGTH:",
  EMAIL_APP_PASSWORD ? EMAIL_APP_PASSWORD.length : 0
);
console.log("====================================");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,

  auth: {
    user: EMAIL_USER,
    pass: EMAIL_APP_PASSWORD
  },

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

// ======================================================
// VERIFY GMAIL SMTP CONNECTION
// ======================================================

if (EMAIL_USER && EMAIL_APP_PASSWORD) {

  transporter.verify()
    .then(() => {
      console.log("====================================");
      console.log("GMAIL SMTP CONNECTION SUCCESS");
      console.log("Email:", EMAIL_USER);
      console.log("====================================");
    })
    .catch((error) => {
      console.error("====================================");
      console.error("GMAIL SMTP CONNECTION FAILED");
      console.error("CODE:", error.code);
      console.error("COMMAND:", error.command);
      console.error("MESSAGE:", error.message);
      console.error("====================================");
    });

} else {

  console.error("====================================");
  console.error("GMAIL SMTP NOT CONFIGURED");
  console.error(
    "Add EMAIL_USER and EMAIL_APP_PASSWORD to Render Environment Variables"
  );
  console.error("====================================");
}


// ======================================================
// TEST EMAIL
// ======================================================
// IMPORTANT:
// If this router is mounted as:
// app.use("/bookings", bookingRoutes);
//
// URL will be:
// GET /bookings/test-email
// ======================================================

router.get("/test-email", async (req, res) => {

  try {

    if (!EMAIL_USER) {
      return res.status(500).json({
        success: false,
        error: "EMAIL_USER is missing in Render"
      });
    }

    if (!EMAIL_APP_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: "EMAIL_APP_PASSWORD is missing in Render"
      });
    }

    console.log("====================================");
    console.log("TESTING GMAIL EMAIL");
    console.log("TO:", EMAIL_USER);
    console.log("====================================");

    const info = await transporter.sendMail({

      from: `"PartyHouse" <${EMAIL_USER}>`,

      to: EMAIL_USER,

      subject: "PartyHouse Test Email",

      text: `
This is a test email from PartyHouse.

If you received this email,
Gmail SMTP is working correctly from Render.
      `,

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: auto;
          padding: 25px;
          border: 1px solid #ddd;
          border-radius: 10px;
        ">

          <h2 style="color:#f97316;">
            PartyHouse Email Test
          </h2>

          <p>
            This is a test email from your PartyHouse backend.
          </p>

          <p>
            If you received this email,
            Gmail SMTP is working correctly from Render.
          </p>

        </div>
      `
    });

    console.log("====================================");
    console.log("TEST EMAIL SENT SUCCESSFULLY");
    console.log("MESSAGE ID:", info.messageId);
    console.log("====================================");

    return res.json({
      success: true,
      message: "Test email sent successfully",
      messageId: info.messageId
    });

  } catch (error) {

    console.error("====================================");
    console.error("TEST EMAIL FAILED");
    console.error("CODE:", error.code);
    console.error("COMMAND:", error.command);
    console.error("RESPONSE:", error.response);
    console.error("MESSAGE:", error.message);
    console.error("====================================");

    return res.status(500).json({
      success: false,
      code: error.code,
      command: error.command,
      message: error.message
    });
  }
});


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

    // Check if room is already booked
    const existingBooking = await pool.query(
      `SELECT *
       FROM bookings
       WHERE roomid = $1
       AND event_date = $2`,
      [room, date]
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({
        error:
          "This room is already booked for the selected date"
      });
    }

    // Insert booking
    const result = await pool.query(
      `INSERT INTO bookings
        (
          name,
          email,
          phone,
          event_date,
          guests,
          message,
          services,
          roomid
        )
       VALUES
        ($1, $2, $3, $4::DATE, $5, $6, $7, $8)
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

    return res.json({
      message: "Booking created",
      booking: result.rows[0]
    });

  } catch (err) {

    console.error(
      "Booking add error:",
      err.message,
      err.stack
    );

    return res.status(500).json({
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
      "SELECT * FROM bookings ORDER BY id DESC"
    );

    return res.json(result.rows);

  } catch (err) {

    console.error(
      "Get all bookings error:",
      err.message
    );

    return res.status(500).json({
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

    return res.json(result.rows[0]);

  } catch (err) {

    console.error(
      "Get booking error:",
      err.message
    );

    return res.status(500).json({
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

    console.log("====================================");
    console.log("BOOKING STATUS UPDATED");
    console.log("Booking ID:", booking.id);
    console.log("Customer:", booking.name);
    console.log("Customer Email:", booking.email);
    console.log("New Status:", status);
    console.log("====================================");


    // ------------------------------------------
    // CHECK EMAIL CONFIGURATION
    // ------------------------------------------

    if (!EMAIL_USER) {

      console.error("EMAIL_USER is missing");

      return res.status(500).json({
        error: "EMAIL_USER is not configured",
        booking
      });
    }

    if (!EMAIL_APP_PASSWORD) {

      console.error("EMAIL_APP_PASSWORD is missing");

      return res.status(500).json({
        error: "EMAIL_APP_PASSWORD is not configured",
        booking
      });
    }


    // ------------------------------------------
    // EMAIL
    // ------------------------------------------

    const mailOptions = {

      from: `"PartyHouse" <${EMAIL_USER}>`,

      to: booking.email,

      subject: `Your PartyHouse Booking is ${status}`,

      text: `
Hello ${booking.name},

Your PartyHouse booking has been updated.

Booking Date: ${booking.event_date}

Status: ${status}

Phone: ${booking.phone}

Guests: ${booking.guests || "Not specified"}

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
            color:#f97316;
            margin-bottom:20px;
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
            background:#f8f8f8;
            padding:18px;
            border-radius:8px;
            margin:20px 0;
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
            color:#777;
            font-size:13px;
          ">
            This is an automated email from PartyHouse.
          </p>

        </div>
      `
    };


    // ------------------------------------------
    // SEND EMAIL
    // ------------------------------------------

    try {

      console.log("====================================");
      console.log("SENDING EMAIL");
      console.log("FROM:", EMAIL_USER);
      console.log("TO:", booking.email);
      console.log("STATUS:", status);
      console.log("====================================");

      const info = await transporter.sendMail(
        mailOptions
      );

      console.log("====================================");
      console.log("EMAIL SENT SUCCESSFULLY");
      console.log("TO:", booking.email);
      console.log("MESSAGE ID:", info.messageId);
      console.log("RESPONSE:", info.response);
      console.log("====================================");

      return res.json({
        message: "Status updated & email sent",
        booking,
        emailSent: true,
        messageId: info.messageId
      });

    } catch (emailError) {

      console.error("====================================");
      console.error("GMAIL EMAIL ERROR");
      console.error("CODE:", emailError.code);
      console.error("COMMAND:", emailError.command);
      console.error("RESPONSE:", emailError.response);
      console.error("MESSAGE:", emailError.message);
      console.error("====================================");

      // Database status was already updated
      return res.status(200).json({
        message:
          "Booking status updated, but email could not be sent",

        booking,

        emailSent: false,

        emailError: {
          code: emailError.code,
          command: emailError.command,
          message: emailError.message
        }
      });
    }

  } catch (err) {

    console.error(
      "Status update error:",
      err.message,
      err.stack
    );

    return res.status(500).json({
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
        error:
          "This room is already booked for the selected date"
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

    return res.json({
      message: "Booking updated",
      booking: result.rows[0]
    });

  } catch (err) {

    console.error(
      "Update booking error:",
      err.message,
      err.stack
    );

    return res.status(500).json({
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

    return res.json({
      message: "Booking deleted successfully"
    });

  } catch (err) {

    console.error(
      "Delete booking error:",
      err.message,
      err.stack
    );

    return res.status(500).json({
      error: "Server error"
    });
  }
});


module.exports = router;