require("dotenv").config({
  path: require("path").resolve(__dirname, ".env"),
});

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const appointments = require("./api/appointments");

const app = express();
const port = process.env.PORT || "5000";

console.log("✅ Current working directory:", process.cwd());

if (!process.env.SSH_HOST || !process.env.DB_HOST) {
  console.error(
    "❌ Failed to load environment variables. Check your .env file."
  );
  process.exit(1);
}

app.use(cors());
app.use(bodyParser.json());

// Root route to avoid "Cannot GET /" error
app.get("/", (req, res) => {
  res.send("Welcome to the API! Use /api/appointments for appointment data.");
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use("/api/appointments", appointments);

app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).send("Internal Server Error");
});

const server = app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${port} is already in use. Try a different port.`);
    process.exit(1);
  } else {
    console.error("❌ Server error:", err);
    process.exit(1);
  }
});
