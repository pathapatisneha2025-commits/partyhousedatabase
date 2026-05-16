const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const { Readable } = require("stream");
const cloudinary = require("../cloudinary");

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, folder = "rooms") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => (result ? resolve(result) : reject(error))
    );
    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
};

// ---------- ADD NEW ROOM ----------
router.post("/add", upload.single("image_url"), async (req, res) => {
  try {
    const { name, capacity, price, description } = req.body;

    if (!name || !capacity || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let image_url = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      image_url = result.secure_url;
    }

    const result = await pool.query(
      `INSERT INTO rooms (name, capacity, price, description, image_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, capacity, price, description, image_url]
    );

    res.json({ message: "Room added successfully", room: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- UPDATE ROOM ----------
router.put("/update/:id", upload.single("image_url"), async (req, res) => {
  try {
    const { name, capacity, price, description } = req.body;

    // get existing room first
    const existing = await pool.query(
      "SELECT * FROM rooms WHERE id=$1",
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    let image_url = existing.rows[0].image_url; // default old image

    // if new image uploaded
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      image_url = result.secure_url;
    }

    const result = await pool.query(
      `UPDATE rooms 
       SET name=$1, capacity=$2, price=$3, description=$4, image_url=$5
       WHERE id=$6
       RETURNING *`,
      [name, capacity, price, description, image_url, req.params.id]
    );

    res.json({
      message: "Room updated successfully",
      room: result.rows[0],
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- GET ALL ROOMS ----------
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM rooms ORDER BY id DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
// ---------- GET ROOM BY ID ----------
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM rooms WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- DELETE ----------
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM rooms WHERE id=$1`, [req.params.id]);
    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
