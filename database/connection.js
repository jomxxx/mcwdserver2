const mysql = require("mysql2/promise");
const sshClient = require("ssh2").Client;

// Validate environment variables
function validateEnvVariables() {
  const requiredEnvVars = [
    'SSH_HOST', 'SSH_PORT', 'SSH_USERNAME', 'SSH_PASSWORD',
    'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'
  ];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      throw new Error(`Missing ${varName} in environment variables.`);
    }
  });
}

validateEnvVariables();

const sshConfig = {
  host: process.env.SSH_HOST,
  port: parseInt(process.env.SSH_PORT, 10),
  username: process.env.SSH_USERNAME,
  password: process.env.SSH_PASSWORD,
};

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

let pool;

// Function to establish SSH connection and create DB pool
async function connectDB() {
  if (pool) return pool; // ✅ Reuse existing pool

  const ssh = new sshClient();
  console.log("Attempting to establish SSH connection...");
  
  return new Promise((resolve, reject) => {
    const connectWithRetry = () => {
      ssh
        .on("ready", () => {
          console.log("SSH connection established.");
          ssh.forwardOut("127.0.0.1", 3306, dbConfig.host, 3306, (err, stream) => {
            if (err) {
              ssh.end();
              return reject(new Error("SSH Tunnel Error: " + err.message));
            }
            console.log("SSH tunnel established. Creating database pool...");
            pool = mysql.createPool({
              ...dbConfig,
              stream,
              waitForConnections: true,
              connectionLimit: process.env.CONNECTION_LIMIT || 10, // Dynamically set connection limit
              queueLimit: 0,
              connectTimeout: 10000, // 10 seconds timeout
            });
            resolve(pool);
          });
        })
        .on("error", (err) => {
          console.error("SSH Connection Error:", err.message);
          setTimeout(connectWithRetry, 5000); // Retry after 5 seconds if SSH connection fails
        })
        .connect(sshConfig);
    };

    connectWithRetry();
  });
}

// Function to execute SQL queries
async function executeQuery(query, params) {
  try {
    const [rows, fields] = await pool.execute(query, params);
    return rows;
  } catch (err) {
    console.error("Database query error:", err);
    throw new Error("Database query failed.");
  }
}

// Graceful shutdown to close DB pool
async function shutdown() {
  if (pool) {
    await pool.end(); // Close the pool connections
    console.log("Database connections closed gracefully.");
  }
}

// Handle process shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await shutdown();
  process.exit(0);
});

// Export the connection and query functions
module.exports = {
  connectDB,
  executeQuery,
};
