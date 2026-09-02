const express = require("express");
const router = express.Router();
const pool = require("../db");

const nodemailer = require("nodemailer");

require("dotenv").config();

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_APP_PASSWORD,
  },
});

async function sendEmail({
  to,
  toName,
  subject,
  htmlContent,
  textContent,
}) {

  if (!EMAIL_USER) {
    throw new Error("EMAIL_USER is missing");
  }

  if (!EMAIL_APP_PASSWORD) {
    throw new Error("EMAIL_APP_PASSWORD is missing");
  }

  const info = await transporter.sendMail({
    from: `"PartyHouse" <${EMAIL_USER}>`,
    to: toName
      ? `"${toName}" <${to}>`
      : to,
    subject,
    text: textContent,
    html: htmlContent,
  });

  return info;
}
// ======================================================
// BREVO HTTP API CONFIGURATION
// ======================================================

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL;
const BREVO_FROM_NAME =
  process.env.BREVO_FROM_NAME || "PartyHouse";

console.log("====================================");
console.log("BREVO EMAIL CONFIGURATION");
console.log(
  "BREVO_API_KEY EXISTS:",
  !!BREVO_API_KEY
);
console.log(
  "BREVO_FROM_EMAIL:",
  BREVO_FROM_EMAIL || "MISSING"
);
console.log(
  "BREVO_FROM_NAME:",
  BREVO_FROM_NAME
);
console.log("====================================");


// ======================================================
// BREVO SEND EMAIL FUNCTION
// ======================================================

async function sendBrevoEmail({
  to,
  toName,
  subject,
  htmlContent,
  textContent
}) {

  if (!BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is missing");
  }

  if (!BREVO_FROM_EMAIL) {
    throw new Error("BREVO_FROM_EMAIL is missing");
  }

  console.log("====================================");
  console.log("BREVO API EMAIL REQUEST");
  console.log("FROM:", BREVO_FROM_EMAIL);
  console.log("TO:", to);
  console.log("SUBJECT:", subject);
  console.log("====================================");

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",

      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
      },

      body: JSON.stringify({
        sender: {
          name: BREVO_FROM_NAME,
          email: BREVO_FROM_EMAIL
        },

        to: [
          {
            email: to,
            name: toName || ""
          }
        ],

        subject: subject,

        textContent: textContent,

        htmlContent: htmlContent
      })
    }
  );

  const responseText = await response.text();

  let responseData;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = {
      raw: responseText
    };
  }

  if (!response.ok) {

    console.error("====================================");
    console.error("BREVO API ERROR");
    console.error("HTTP STATUS:", response.status);
    console.error("RESPONSE:", responseData);
    console.error("====================================");

    throw new Error(
      responseData.message ||
      `Brevo API returned HTTP ${response.status}`
    );
  }

  console.log("====================================");
  console.log("BREVO EMAIL SENT SUCCESSFULLY");
  console.log("TO:", to);
  console.log(
    "MESSAGE ID:",
    responseData.messageId
  );
  console.log("====================================");

  return responseData;
}


// ======================================================
// TEST BREVO EMAIL
// ======================================================
//
// If your server has:
//
// app.use("/bookings", bookingRoutes);
//
// Then test:
//
// GET /bookings/test-email
// ======================================================

router.get("/test-email", async (req, res) => {

  try {

    if (!BREVO_API_KEY) {

      return res.status(500).json({
        success: false,
        error:
          "BREVO_API_KEY is missing in Render Environment Variables"
      });
    }

    if (!BREVO_FROM_EMAIL) {

      return res.status(500).json({
        success: false,
        error:
          "BREVO_FROM_EMAIL is missing in Render Environment Variables"
      });
    }


    console.log("====================================");
    console.log("TESTING BREVO EMAIL");
    console.log("TO:", BREVO_FROM_EMAIL);
    console.log("====================================");


    const result = await sendBrevoEmail({

      to: BREVO_FROM_EMAIL,

      toName: "PartyHouse Admin",

      subject: "PartyHouse Test Email",

      textContent: `
Hello,

This is a test email from PartyHouse.

If you received this email, the Brevo HTTP API is working correctly with your Render backend.

Thank you.
      `,

      htmlContent: `
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
          ">
            PartyHouse Email Test
          </h2>

          <p>
            Hello,
          </p>

          <p>
            This is a test email from your
            <strong>PartyHouse</strong> backend.
          </p>

          <p>
            If you received this email,
            the <strong>Brevo HTTP API</strong>
            is working correctly with Render.
          </p>

          <hr />

          <p style="
            color:#777;
            font-size:13px;
          ">
            PartyHouse automated email test.
          </p>

        </div>
      `
    });


    return res.json({

      success: true,

      message:
        "Test email sent successfully",

      messageId:
        result.messageId
    });

  } catch (error) {

    console.error("====================================");
    console.error("BREVO TEST EMAIL FAILED");
    console.error("MESSAGE:", error.message);
    console.error("====================================");

    return res.status(500).json({

      success: false,

      error: error.message
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


    // ------------------------------------------
    // REQUIRED FIELDS
    // ------------------------------------------

    if (
      !name ||
      !email ||
      !phone ||
      !date ||
      !room
    ) {

      return res.status(400).json({
        error: "Missing required fields"
      });
    }


    // ------------------------------------------
    // CHECK ROOM AVAILABILITY
    // ------------------------------------------

    const existingBooking = await pool.query(
      `SELECT *
       FROM bookings
       WHERE roomid = $1
       AND event_date = $2`,
      [
        room,
        date
      ]
    );


    if (existingBooking.rows.length > 0) {

      return res.status(400).json({
        error:
          "This room is already booked for the selected date"
      });
    }


    // ------------------------------------------
    // INSERT BOOKING
    // ------------------------------------------

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
      (
        $1,
        $2,
        $3,
        $4::DATE,
        $5,
        $6,
        $7,
        $8
      )
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

      message:
        "Booking created",

      booking:
        result.rows[0]
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
      `SELECT *
       FROM bookings
       ORDER BY id DESC`
    );

    return res.json(
      result.rows
    );

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
      `SELECT *
       FROM bookings
       WHERE id=$1`,
      [
        req.params.id
      ]
    );


    if (result.rows.length === 0) {

      return res.status(404).json({
        error:
          "Booking not found"
      });
    }


    return res.json(
      result.rows[0]
    );

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
// UPDATE BOOKING STATUS
// SEND EMAIL ONLY WHEN BOOKING IS CONFIRMED
// ======================================================

router.put("/status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // ==================================================
    // VALIDATE STATUS
    // ==================================================

    if (!status || String(status).trim() === "") {
      return res.status(400).json({
        error: "Status is required",
      });
    }

    const newStatus = String(status).trim();

    // ==================================================
    // GET CURRENT BOOKING
    // ==================================================

    const currentResult = await pool.query(
      `
      SELECT *
      FROM bookings
      WHERE id = $1
      `,
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    const currentBooking = currentResult.rows[0];

    const oldStatus = currentBooking.status;

    // ==================================================
    // CHECK IF STATUS IS ACTUALLY CHANGING
    // ==================================================

    const oldStatusLower = String(oldStatus || "").toLowerCase();
    const newStatusLower = newStatus.toLowerCase();

    // ==================================================
    // UPDATE DATABASE
    // ==================================================

    const result = await pool.query(
      `
      UPDATE bookings
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [newStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found",
      });
    }

    const booking = result.rows[0];

    console.log("====================================");
    console.log("BOOKING STATUS UPDATED");
    console.log("Booking ID:", booking.id);
    console.log("Customer:", booking.name);
    console.log("Customer Email:", booking.email);
    console.log("Old Status:", oldStatus);
    console.log("New Status:", booking.status);
    console.log("====================================");

    // ==================================================
    // EMAIL ONLY WHEN STATUS BECOMES CONFIRMED
    // ==================================================

    const isConfirmed =
      newStatusLower === "confirmed";

    const wasAlreadyConfirmed =
      oldStatusLower === "confirmed";

    // ==================================================
    // NO EMAIL FOR OTHER STATUS
    // ==================================================

    if (!isConfirmed) {
      return res.status(200).json({
        message: "Booking status updated",
        booking,
        emailSent: false,
      });
    }

    // ==================================================
    // PREVENT DUPLICATE CONFIRMATION EMAIL
    // ==================================================

    if (wasAlreadyConfirmed) {
      console.log("====================================");
      console.log("BOOKING ALREADY CONFIRMED");
      console.log("NO DUPLICATE EMAIL SENT");
      console.log("====================================");

      return res.status(200).json({
        message: "Booking was already confirmed",
        booking,
        emailSent: false,
      });
    }

    // ==================================================
    // CHECK EMAIL CONFIGURATION
    // ==================================================

    if (!EMAIL_USER) {
      console.error("EMAIL_USER is missing");

      return res.status(200).json({
        message:
          "Booking confirmed, but email configuration is missing",
        booking,
        emailSent: false,
        emailError:
          "EMAIL_USER is not configured",
      });
    }

    if (!EMAIL_APP_PASSWORD) {
      console.error("EMAIL_APP_PASSWORD is missing");

      return res.status(200).json({
        message:
          "Booking confirmed, but email configuration is missing",
        booking,
        emailSent: false,
        emailError:
          "EMAIL_APP_PASSWORD is not configured",
      });
    }

    // ==================================================
    // CHECK CUSTOMER EMAIL
    // ==================================================

    if (
      !booking.email ||
      String(booking.email).trim() === ""
    ) {
      console.error(
        "Customer email is missing"
      );

      return res.status(200).json({
        message:
          "Booking confirmed, but customer email is missing",
        booking,
        emailSent: false,
        emailError:
          "Customer email is missing",
      });
    }

    // ==================================================
    // CUSTOMER INFORMATION
    // ==================================================

    const customerName =
      booking.name || "Customer";

    const customerEmail =
      String(booking.email).trim();

    const bookingId =
      booking.id;

    const eventDate =
      booking.event_date || "Not specified";

    const phone =
      booking.phone || "Not specified";

    const guests =
      booking.guests || "Not specified";

    // ==================================================
    // PLAIN TEXT EMAIL
    // ==================================================

    const textContent = `
Hello ${customerName},

Great news!

Your PartyHouse booking has been CONFIRMED.

Booking Details
----------------------------

Booking ID:
${bookingId}

Booking Date:
${eventDate}

Phone:
${phone}

Guests:
${guests}

Status:
CONFIRMED

Thank you for choosing PartyHouse.

We look forward to welcoming you!

This is an automated email from PartyHouse.
Please do not reply to this email.
`;

    // ==================================================
    // HTML EMAIL
    // ==================================================

    const htmlContent = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>PartyHouse Booking Confirmed</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f5f5f5;
    font-family:Arial,Helvetica,sans-serif;
  "
>

<div
  style="
    max-width:600px;
    margin:30px auto;
    background:#ffffff;
    border-radius:12px;
    overflow:hidden;
    border:1px solid #e5e5e5;
  "
>

  <!-- HEADER -->

  <div
    style="
      background:#f97316;
      padding:25px;
      text-align:center;
    "
  >

    <h1
      style="
        margin:0;
        color:#ffffff;
        font-size:30px;
      "
    >
      PartyHouse
    </h1>

  </div>


  <!-- CONTENT -->

  <div
    style="
      padding:30px;
    "
  >

    <h2
      style="
        margin-top:0;
        text-align:center;
        color:#16a34a;
      "
    >
      Booking Confirmed 🎉
    </h2>


    <p
      style="
        font-size:16px;
        color:#333333;
        line-height:1.6;
      "
    >

      Hello
      <strong>${customerName}</strong>,

    </p>


    <p
      style="
        font-size:15px;
        color:#555555;
        line-height:1.7;
      "
    >

      Great news! Your
      <strong>PartyHouse</strong>
      booking has been successfully confirmed.

    </p>


    <!-- BOOKING DETAILS -->

    <div
      style="
        background:#f8f8f8;
        border-radius:10px;
        padding:20px;
        margin:25px 0;
      "
    >

      <h3
        style="
          margin-top:0;
          color:#333333;
        "
      >
        Booking Details
      </h3>


      <p>
        <strong>Booking ID:</strong>
        ${bookingId}
      </p>


      <p>
        <strong>Booking Date:</strong>
        ${eventDate}
      </p>


      <p>
        <strong>Phone:</strong>
        ${phone}
      </p>


      <p>
        <strong>Guests:</strong>
        ${guests}
      </p>


      <p>

        <strong>Status:</strong>

        <span
          style="
            color:#16a34a;
            font-weight:bold;
          "
        >
          CONFIRMED
        </span>

      </p>

    </div>


    <p
      style="
        font-size:15px;
        color:#555555;
        line-height:1.7;
      "
    >

      Thank you for choosing
      <strong>PartyHouse</strong>.

    </p>


    <p
      style="
        font-size:15px;
        color:#555555;
      "
    >

      We look forward to welcoming you!

    </p>


    <hr
      style="
        border:0;
        border-top:1px solid #eeeeee;
        margin:30px 0;
      "
    />


    <p
      style="
        color:#999999;
        font-size:12px;
        text-align:center;
        line-height:1.5;
      "
    >

      This is an automated email from PartyHouse.
      <br>
      Please do not reply to this email.

    </p>

  </div>

</div>

</body>

</html>
`;

    // ==================================================
    // SEND REAL CONFIRMATION EMAIL
    // ==================================================

    try {
      console.log("====================================");
      console.log(
        "SENDING BOOKING CONFIRMATION EMAIL"
      );
      console.log("FROM:", EMAIL_USER);
      console.log("TO:", customerEmail);
      console.log("BOOKING ID:", bookingId);
      console.log("====================================");

      const emailResult = await sendEmail({
        to: customerEmail,
        toName: customerName,
        subject:
          "🎉 Your PartyHouse Booking is Confirmed",
        textContent,
        htmlContent,
      });

      console.log("====================================");
      console.log(
        "BOOKING CONFIRMATION EMAIL SENT"
      );
      console.log("TO:", customerEmail);
      console.log(
        "MESSAGE ID:",
        emailResult.messageId
      );
      console.log("====================================");

      return res.status(200).json({
        message:
          "Booking confirmed & confirmation email sent",

        booking,

        emailSent: true,

        messageId:
          emailResult.messageId,
      });

    } catch (emailError) {

      console.error("====================================");
      console.error(
        "BOOKING CONFIRMATION EMAIL FAILED"
      );
      console.error(
        "ERROR:",
        emailError.message
      );
      console.error(
        "STACK:",
        emailError.stack
      );
      console.error("====================================");

      // Booking remains CONFIRMED.
      // Email failure must NOT undo the booking status.

      return res.status(200).json({
        message:
          "Booking confirmed, but confirmation email could not be sent",

        booking,

        emailSent: false,

        emailError:
          emailError.message,
      });
    }

  } catch (err) {

    console.error("====================================");
    console.error("STATUS UPDATE ERROR");
    console.error("MESSAGE:", err.message);
    console.error("STACK:", err.stack);
    console.error("====================================");

    return res.status(500).json({
      error: "Server error",
      details: err.message,
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


    // ------------------------------------------
    // REQUIRED FIELDS
    // ------------------------------------------

    if (
      !name ||
      !email ||
      !phone ||
      !date ||
      !room
    ) {

      return res.status(400).json({
        error:
          "Missing required fields"
      });
    }


    // ------------------------------------------
    // CHECK DUPLICATE ROOM
    // ------------------------------------------

    const existingBooking =
      await pool.query(
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


    if (
      existingBooking.rows.length > 0
    ) {

      return res.status(400).json({
        error:
          "This room is already booked for the selected date"
      });
    }


    // ------------------------------------------
    // UPDATE BOOKING
    // ------------------------------------------

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


    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          "Booking not found"
      });
    }


    return res.json({

      message:
        "Booking updated",

      booking:
        result.rows[0]
    });


  } catch (err) {

    console.error(
      "Update booking error:",
      err.message,
      err.stack
    );

    return res.status(500).json({
      error:
        "Server error"
    });
  }
});


// ======================================================
// DELETE BOOKING
// ======================================================

router.delete(
  "/delete/:id",
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `DELETE FROM bookings
           WHERE id=$1
           RETURNING *`,
          [
            req.params.id
          ]
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            "Booking not found"
        });
      }


      return res.json({

        message:
          "Booking deleted successfully"
      });


    } catch (err) {

      console.error(
        "Delete booking error:",
        err.message,
        err.stack
      );

      return res.status(500).json({
        error:
          "Server error"
      });
    }
  }
);


module.exports = router;