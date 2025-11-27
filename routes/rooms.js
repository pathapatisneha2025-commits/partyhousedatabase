const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");

// ---------- Cloudinary Storage Setup ----------
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "rooms", // folder in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => {
      const nameWithoutExt = path.parse(file.originalname).name;
      return Date.now() + "-" + nameWithoutExt;
    },
  },
});

const upload = multer({ storage });

// ---------- ADD NEW ROOM ----------
router.post("/add", upload.single("image_url"), async (req, res) => {
  try {
    const { name, capacity, price, description } = req.body;

    if (!name || !capacity || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Cloudinary automatically provides secure_url
    const image_url = req.file ? req.file.path : ""; 

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
router.put("/update/:id", upload.single("image_file"), async (req, res) => {
  try {
    const { name, capacity, price, description } = req.body;
    const image_url = req.file ? req.file.path : req.body.image_url;

    const result = await pool.query(
      `UPDATE rooms 
       SET name = $1, capacity = $2, price = $3, description = $4, image_url = $5
       WHERE id = $6
       RETURNING *`,
      [name, capacity, price, description, image_url, req.params.id]
    );

    res.json({ message: "Room updated", room: result.rows[0] });
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

// ---------- DELETE ----------
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM rooms WHERE id = $1`, [req.params.id]);
    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
