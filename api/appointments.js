const express = require("express");
const router = express.Router();
const connectDB = require("../database/connection");
const EventEmitter = require("events");
const emitter = new EventEmitter();
emitter.setMaxListeners(20); // Increase the max listeners limit

function generateAppointmentCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// In-memory queue
const requestQueue = [];
let isProcessing = false;

function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;
  const { handler, req, res } = requestQueue.shift();

  handler(req, res)
    .catch((error) => {
      console.error("Error processing request:", error);
      res.status(500).json({ error: "Internal server error" });
    })
    .finally(() => {
      isProcessing = false;
      processQueue(); // Process the next request in the queue
    });
}

function queueRequest(handler) {
  return (req, res) => {
    requestQueue.push({ handler, req, res });
    processQueue();
  };
}

router.post(
  "/",
  queueRequest(async (req, res) => {
    const { date, time, category, category_description, age } = req.body;

    if (!date || !time || !category || !category_description || !age) {
      return res.status(400).json({ error: "All fields are required." });
    }

    try {
      const db = await connectDB();
      const appointmentCode = generateAppointmentCode();
      const formattedDate = new Date(date).toISOString().split("T")[0];

      const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!timeMatch) {
        return res.status(400).json({ error: "Invalid time format." });
      }

      let [_, hour, minute, period] = timeMatch;
      hour = parseInt(hour, 10);

      if (period?.toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (period?.toUpperCase() === "AM" && hour === 12) hour = 0;

      const appointmentDateTime = new Date(
        `${formattedDate}T${hour.toString().padStart(2, "0")}:${minute}:00`
      );

      const validUntilDate = new Date(
        appointmentDateTime.getTime() + (8 * 60 + 30) * 60000
      );
      const date_validity = validUntilDate
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const [existingBookings] = await db.query(
        "SELECT COUNT(*) AS count FROM tappointment WHERE date_selected = ?",
        [appointmentDateTime]
      );

      if (existingBookings[0].count >= 10) {
        return res
          .status(400)
          .json({ error: "This time slot is fully booked." });
      }

      await db.query(
        "INSERT INTO tappointment (appointment_code, date_selected, date_validity, category_code, category_description, age, que_statuscode, que_description, date_created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
        [
          appointmentCode,
          appointmentDateTime,
          date_validity,
          category,
          category_description,
          age,
          "PD",
          "PENDING",
        ]
      );

      res.status(201).json({
        message: "Appointment created successfully.",
        code: appointmentCode,
      });
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  })
);

router.get(
  "/",
  queueRequest(async (req, res) => {
    try {
      const db = await connectDB();
      const [appointments] = await db.query(
        "SELECT * FROM tappointment ORDER BY date_selected ASC"
      );

      res.status(200).json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).send("Internal server error");
    }
  })
);

router.get(
  "/fully-booked",
  queueRequest(async (req, res) => {
    try {
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ error: "Date is required." });
      }

      const db = await connectDB();
      const [fullyBookedSlots] = await db.query(
        `SELECT date_selected 
         FROM tappointment 
         WHERE DATE(date_selected) = ? AND que_statuscode = 'PD'
         GROUP BY date_selected 
         HAVING COUNT(*) >= 10`,
        [date]
      );

      console.log("Fully booked slots for date:", date, fullyBookedSlots); // Debugging log
      res.status(200).json(fullyBookedSlots || []); // Return an empty array if no results
    } catch (error) {
      console.error("Error fetching fully booked slots:", error);
      res.status(500).json({ error: "Internal server error" }); // Ensure JSON response
    }
  })
);

module.exports = router;
