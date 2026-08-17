const express = require("express");
const router = express.Router();
const pool = require("../db");

require("dotenv").config();

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
// UPDATE BOOKING STATUS + SEND EMAIL
// ======================================================

router.put("/status/:id", async (req, res) => {

  const {
    id
  } = req.params;

  const {
    status
  } = req.body;


  try {

    // ------------------------------------------
    // CHECK STATUS
    // ------------------------------------------

    if (!status) {

      return res.status(400).json({
        error:
          "Status is required"
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
      [
        status,
        id
      ]
    );


    if (result.rows.length === 0) {

      return res.status(404).json({
        error:
          "Booking not found"
      });
    }


    const booking =
      result.rows[0];


    console.log("====================================");
    console.log(
      "BOOKING STATUS UPDATED"
    );
    console.log(
      "Booking ID:",
      booking.id
    );
    console.log(
      "Customer:",
      booking.name
    );
    console.log(
      "Customer Email:",
      booking.email
    );
    console.log(
      "New Status:",
      status
    );
    console.log("====================================");


    // ------------------------------------------
    // CHECK BREVO CONFIG
    // ------------------------------------------

    if (!BREVO_API_KEY) {

      console.error(
        "BREVO_API_KEY is missing"
      );

      return res.status(500).json({

        error:
          "BREVO_API_KEY is not configured",

        booking,

        emailSent:
          false
      });
    }


    if (!BREVO_FROM_EMAIL) {

      console.error(
        "BREVO_FROM_EMAIL is missing"
      );

      return res.status(500).json({

        error:
          "BREVO_FROM_EMAIL is not configured",

        booking,

        emailSent:
          false
      });
    }


    // ------------------------------------------
    // EMAIL TEXT
    // ------------------------------------------

    const textContent = `
Hello ${booking.name},

Your PartyHouse booking has been updated.

Booking Date:
${booking.event_date}

Status:
${status}

Phone:
${booking.phone}

Guests:
${booking.guests || "Not specified"}

Thank you for choosing PartyHouse.

This is an automated email from PartyHouse.
    `;


    // ------------------------------------------
    // EMAIL HTML
    // ------------------------------------------

    const htmlContent = `

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
          <strong>
            ${booking.name}
          </strong>,
        </p>


        <p>
          Your PartyHouse booking
          status has been updated.
        </p>


        <div style="
          background:#f8f8f8;
          padding:18px;
          border-radius:8px;
          margin:20px 0;
        ">

          <p>
            <strong>
              Booking Date:
            </strong>

            ${booking.event_date}
          </p>


          <p>
            <strong>
              Status:
            </strong>

            ${status}
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

        </div>


        <p>
          Thank you for choosing
          <strong>
            PartyHouse
          </strong>.
        </p>


        <p style="
          color:#777;
          font-size:13px;
        ">
          This is an automated email
          from PartyHouse.
        </p>

      </div>
    `;


    // ------------------------------------------
    // SEND EMAIL
    // ------------------------------------------

    try {

      console.log("====================================");
      console.log(
        "SENDING EMAIL THROUGH BREVO"
      );
      console.log(
        "FROM:",
        BREVO_FROM_EMAIL
      );
      console.log(
        "TO:",
        booking.email
      );
      console.log(
        "STATUS:",
        status
      );
      console.log("====================================");


      const emailResult =
        await sendBrevoEmail({

          to:
            booking.email,

          toName:
            booking.name,

          subject:
            `Your PartyHouse Booking is ${status}`,

          textContent,

          htmlContent
        });


      console.log("====================================");
      console.log(
        "EMAIL SENT SUCCESSFULLY"
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
          "Status updated & email sent",

        booking,

        emailSent:
          true,

        messageId:
          emailResult.messageId
      });


    } catch (emailError) {

      console.error("====================================");
      console.error(
        "BREVO EMAIL ERROR"
      );
      console.error(
        "MESSAGE:",
        emailError.message
      );
      console.error("====================================");


      // IMPORTANT:
      // Database status was already updated.

      return res.status(200).json({

        message:
          "Booking status updated, but email could not be sent",

        booking,

        emailSent:
          false,

        emailError:
          emailError.message
      });
    }


  } catch (err) {

    console.error(
      "Status update error:",
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