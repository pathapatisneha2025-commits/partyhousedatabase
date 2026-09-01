
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Bookings = require("./routes/bookings");
const Rooms = require("./routes/rooms");
const Admin = require("./routes/admin");
const Contact= require("./routes/contact");


const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/bookings", Bookings);
app.use("/rooms", Rooms);
app.use("/admin", Admin);
app.use("/contact",Contact);

// Test Route
app.get("/", (req, res) => {
  res.send("Backend is running...");
});

// Start Server
const PORT = 5003;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
