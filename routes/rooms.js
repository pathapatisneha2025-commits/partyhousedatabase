const express = require("express");
const router = express.Router();
const pool = require("../db"); // PostgreSQL pool

// ✅ ADD NEW ROOM
router.post("/add", async (req, res) => {
  try {
    const { name, capacity, price, description, image_url } = req.body;

    if (!name || !capacity || !price) {
      return res.status(400).json({ error: "Missing required fields" });
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

// ✅ GET ALL ROOMS
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM rooms ORDER BY id DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ UPDATE ROOM
router.put("/update/:id", async (req, res) => {
  try {
    const { name, capacity, price, description, image_url } = req.body;

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

// ✅ DELETE ROOM
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM rooms WHERE id = $1`, [req.params.id]);
    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
