require("dotenv").config({
  path: require("path").resolve(__dirname, ".env"),
}); // Dynamically resolve .env path

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const appointments = require("./api/appointments");

const app = express();
const port = process.env.PORT || "5000";

// Debug logs
console.log("✅ Current working directory:", process.cwd());

// Ensure .env variables are loaded
if (!process.env.SSH_HOST || !process.env.DB_HOST) {
  console.error(
    "❌ Failed to load environment variables. Check your .env file."
  );
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use("/api/appointments", appointments);

// Serve React build files
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath));

// Handle React routes
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).send("Internal Server Error");
});

// Start the server
const server = app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

// Handle server errors
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${port} is already in use. Try a different port.`);
    process.exit(1);
  } else {
    console.error("❌ Server error:", err);
    process.exit(1);
  }
});
