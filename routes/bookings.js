const express = require("express");
const router = express.Router();
const pool = require("../db");

require("dotenv").config();
const nodemailer = require("nodemailer");

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
    to: toName ? `"${toName}" <${to}>` : to,
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

    // ------------------------------------------
    // CHECK STATUS
    // ------------------------------------------

    if (!status) {
      return res.status(400).json({
        error: "Status is required"
      });
    }

    // ------------------------------------------
    // GET CURRENT BOOKING FIRST
    // ------------------------------------------

    const currentResult = await pool.query(
      `SELECT *
       FROM bookings
       WHERE id=$1`,
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    const currentBooking = currentResult.rows[0];

    const oldStatus = currentBooking.status;

    // ------------------------------------------
    // UPDATE DATABASE
    // ------------------------------------------

    const result = await pool.query(
      `UPDATE bookings
       SET status=$1
       WHERE id=$2
       RETURNING *`,
      [
        status,
        id
      ]
    );

    const booking = result.rows[0];

    console.log("====================================");
    console.log("BOOKING STATUS UPDATED");
    console.log("Booking ID:", booking.id);
    console.log("Customer:", booking.name);
    console.log("Customer Email:", booking.email);
    console.log("Old Status:", oldStatus);
    console.log("New Status:", status);
    console.log("====================================");


    // ==================================================
    // EMAIL ONLY WHEN STATUS BECOMES CONFIRMED
    // ==================================================

    const isConfirmed =
      String(status).toLowerCase() === "confirmed";

    const wasAlreadyConfirmed =
      String(oldStatus || "").toLowerCase() === "confirmed";


    // ------------------------------------------
    // NO EMAIL FOR OTHER STATUS
    // ------------------------------------------

    if (!isConfirmed) {

      return res.json({

        message: "Booking status updated",

        booking,

        emailSent: false

      });
    }


    // ------------------------------------------
    // PREVENT DUPLICATE CONFIRMATION EMAIL
    // ------------------------------------------

    if (wasAlreadyConfirmed) {

      console.log("====================================");
      console.log(
        "BOOKING WAS ALREADY CONFIRMED"
      );
      console.log(
        "NO DUPLICATE EMAIL SENT"
      );
      console.log("====================================");

      return res.json({

        message:
          "Booking was already confirmed",

        booking,

        emailSent: false

      });
    }


    // ==================================================
    // CHECK EMAIL CONFIGURATION
    // ==================================================

    if (!EMAIL_USER) {

      console.error(
        "EMAIL_USER is missing"
      );

      return res.status(200).json({

        message:
          "Booking confirmed, but email configuration is missing",

        booking,

        emailSent: false,

        emailError:
          "EMAIL_USER is not configured"

      });
    }


    if (!EMAIL_APP_PASSWORD) {

      console.error(
        "EMAIL_APP_PASSWORD is missing"
      );

      return res.status(200).json({

        message:
          "Booking confirmed, but email configuration is missing",

        booking,

        emailSent: false,

        emailError:
          "EMAIL_APP_PASSWORD is not configured"

      });
    }


    // ==================================================
    // CHECK CUSTOMER EMAIL
    // ==================================================

    if (!booking.email) {

      console.error(
        "Customer email is missing"
      );

      return res.status(200).json({

        message:
          "Booking confirmed, but customer email is missing",

        booking,

        emailSent: false,

        emailError:
          "Customer email is missing"

      });
    }


    // ==================================================
    // EMAIL TEXT
    // ==================================================

    const textContent = `

Hello ${booking.name},

Great news!

Your PartyHouse booking has been CONFIRMED.

Booking Details
----------------------------

Booking ID:
${booking.id}

Booking Date:
${booking.event_date}

Phone:
${booking.phone}

Guests:
${booking.guests || "Not specified"}

Status:
CONFIRMED

Thank you for choosing PartyHouse.

We look forward to welcoming you!

This is an automated email from PartyHouse.

    `;


    // ==================================================
    // EMAIL HTML
    // ==================================================

    const htmlContent = `

<div style="
  font-family: Arial, sans-serif;
  max-width: 600px;
  margin: 20px auto;
  padding: 30px;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  background: #ffffff;
">

  <div style="
    text-align: center;
    margin-bottom: 25px;
  ">

    <h1 style="
      color: #f97316;
      margin: 0;
      font-size: 28px;
    ">
      PartyHouse
    </h1>

  </div>


  <h2 style="
    color: #16a34a;
    text-align: center;
    margin-bottom: 25px;
  ">
    Booking Confirmed 🎉
  </h2>


  <p style="
    font-size: 16px;
    color: #333;
  ">

    Hello
    <strong>
      ${booking.name}
    </strong>,

  </p>


  <p style="
    font-size: 15px;
    color: #555;
    line-height: 1.6;
  ">

    Great news! Your
    <strong>
      PartyHouse
    </strong>
    booking has been confirmed.

  </p>


  <div style="
    background: #f8f8f8;
    padding: 20px;
    border-radius: 10px;
    margin: 25px 0;
  ">

    <h3 style="
      margin-top: 0;
      color: #333;
    ">
      Booking Details
    </h3>


    <p>
      <strong>
        Booking ID:
      </strong>

      ${booking.id}
    </p>


    <p>
      <strong>
        Booking Date:
      </strong>

      ${booking.event_date}
    </p>


    <p>
      <strong>
        Phone:
      </strong>

      ${booking.phone}
    </p>


    <p>
      <strong>
        Guests:
      </strong>

      ${booking.guests || "Not specified"}
    </p>


    <p>
      <strong>
        Status:
      </strong>

      <span style="
        color: #16a34a;
        font-weight: bold;
      ">
        CONFIRMED
      </span>
    </p>

  </div>


  <p style="
    font-size: 15px;
    color: #555;
    line-height: 1.6;
  ">

    Thank you for choosing
    <strong>
      PartyHouse
    </strong>.

  </p>


  <p style="
    font-size: 15px;
    color: #555;
  ">

    We look forward to welcoming you!

  </p>


  <hr style="
    border: 0;
    border-top: 1px solid #eee;
    margin: 25px 0;
  ">


  <p style="
    color: #999;
    font-size: 12px;
    text-align: center;
  ">

    This is an automated email from PartyHouse.
    Please do not reply to this email.

  </p>

</div>

    `;


    // ==================================================
    // SEND CONFIRMATION EMAIL
    // ==================================================

    try {

      console.log("====================================");
      console.log(
        "SENDING BOOKING CONFIRMATION EMAIL"
      );
      console.log(
        "FROM:",
        EMAIL_USER
      );
      console.log(
        "TO:",
        booking.email
      );
      console.log(
        "BOOKING ID:",
        booking.id
      );
      console.log("====================================");


      const emailResult = await sendEmail({

        to:
          booking.email,

        toName:
          booking.name,

        subject:
          "🎉 Your PartyHouse Booking is Confirmed",

        textContent,

        htmlContent

      });


      console.log("====================================");
      console.log(
        "BOOKING CONFIRMATION EMAIL SENT"
      );
      console.log(
        "TO:",
        booking.email
      );
      console.log(
        "MESSAGE ID:",
        emailResult.messageId
      );
      console.log("====================================");


      return res.json({

        message:
          "Booking confirmed & confirmation email sent",

        booking,

        emailSent:
          true,

        messageId:
          emailResult.messageId

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
      console.error("====================================");


      // IMPORTANT:
      // Booking is already confirmed in database.
      // We don't change it back if email fails.

      return res.status(200).json({

        message:
          "Booking confirmed, but confirmation email could not be sent",

        booking,

        emailSent:
          false,

        emailError:
          emailError.message

      });

    }


  } catch (err) {

    console.error("====================================");
    console.error(
      "STATUS UPDATE ERROR"
    );
    console.error(
      "MESSAGE:",
      err.message
    );
    console.error(
      "STACK:",
      err.stack
    );
    console.error("====================================");


    return res.status(500).json({

      error:
        "Server error"

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