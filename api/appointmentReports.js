const express = require("express");
const router = express.Router();
const connectDB = require("../database/connection");

router.get("/stats", async (req, res) => {
  try {
    const db = await connectDB();
    const today = new Date().toISOString().split("T")[0];

    const [totalAppointments] = await db.query(
      "SELECT COUNT(*) AS totalAppointments FROM tappointment"
    );
    const [todayAppointments] = await db.query(
      "SELECT COUNT(*) AS todayAppointments FROM tappointment WHERE DATE(date_selected) = ?",
      [today]
    );

    res.status(200).json({
      totalAppointments: totalAppointments[0].totalAppointments,
      todayAppointments: todayAppointments[0].todayAppointments,
    });
  } catch (error) {
    console.error("Error fetching appointment stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
