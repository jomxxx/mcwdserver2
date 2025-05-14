const mysql = require("mysql2/promise");
const sshClient = require("ssh2").Client;

const LOG_ENABLED = process.env.DB_LOG === "true";

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

// Validate environment variables
if (!sshConfig.host)
  throw new Error("Missing SSH_HOST in environment variables.");
if (!sshConfig.port)
  throw new Error("Missing or invalid SSH_PORT in environment variables.");
if (!sshConfig.username)
  throw new Error("Missing SSH_USERNAME in environment variables.");
if (!sshConfig.password)
  throw new Error("Missing SSH_PASSWORD in environment variables.");
if (!dbConfig.host)
  throw new Error("Missing DB_HOST in environment variables.");
if (!dbConfig.user)
  throw new Error("Missing DB_USER in environment variables.");
if (!dbConfig.password)
  throw new Error("Missing DB_PASSWORD in environment variables.");
if (!dbConfig.database)
  throw new Error("Missing DB_NAME in environment variables.");

let pool;
let ssh;
let sshStream;

function log(...args) {
  if (LOG_ENABLED) {
    console.log("[DB]", ...args);
  }
}

async function connectDB(retries = 3, delay = 2000) {
  if (pool) return pool; // ✅ Reuse existing pool

  ssh = new sshClient();

  return new Promise((resolve, reject) => {
    const attemptConnection = (retryCount) => {
      ssh
        .on("ready", () => {
          log("SSH connection ready.");
          ssh.forwardOut(
            "127.0.0.1",
            3306,
            dbConfig.host,
            3306,
            (err, stream) => {
              if (err) {
                ssh.end();
                if (retryCount > 0) {
                  log(
                    `SSH Tunnel Error: ${err.message}. Retrying in ${delay}ms...`
                  );
                  setTimeout(() => attemptConnection(retryCount - 1), delay);
                } else {
                  return reject(new Error("SSH Tunnel Error: " + err.message));
                }
              } else {
                sshStream = stream;
                // Enable keep-alive on SSH stream
                stream.setKeepAlive && stream.setKeepAlive(true, 10000);

                pool = mysql.createPool({
                  ...dbConfig,
                  stream,
                  waitForConnections: true,
                  connectionLimit: 20,
                  queueLimit: 0,
                  connectTimeout: 30000,
                  // Enable MySQL keep-alive
                  enableKeepAlive: true,
                  keepAliveInitialDelay: 10000,
                });

                // Handle pool errors and auto-reconnect
                pool.on &&
                  pool.on("error", (err) => {
                    log("MySQL Pool Error:", err);
                    if (err.code === "PROTOCOL_CONNECTION_LOST") {
                      log("Reconnecting MySQL pool...");
                      pool = null;
                      connectDB().catch((e) => log("Reconnect failed:", e));
                    }
                  });

                log("MySQL pool created.");
                resolve(pool);
              }
            }
          );
        })
        .on("error", (err) => {
          if (retryCount > 0) {
            log(
              `SSH Connection Error: ${err.message}. Retrying in ${delay}ms...`
            );
            setTimeout(() => attemptConnection(retryCount - 1), delay);
          } else {
            reject(
              new Error(
                `SSH Connection Error: ${err.message}. Check SSH credentials.`
              )
            );
          }
        })
        .on("close", () => {
          log("SSH connection closed.");
          // Optionally, auto-reconnect SSH here if needed
        })
        .connect(sshConfig);
    };

    attemptConnection(retries);
  });
}

// Graceful shutdown
async function closeDB() {
  log("Shutting down DB connections...");
  if (pool) {
    try {
      await pool.end();
      log("MySQL pool closed.");
    } catch (e) {
      log("Error closing MySQL pool:", e);
    }
    pool = null;
  }
  if (sshStream) {
    try {
      sshStream.end();
      log("SSH stream closed.");
    } catch (e) {
      log("Error closing SSH stream:", e);
    }
    sshStream = null;
  }
  if (ssh) {
    try {
      ssh.end();
      log("SSH connection closed.");
    } catch (e) {
      log("Error closing SSH connection:", e);
    }
    ssh = null;
  }
}

// Handle process exit for graceful shutdown
process.on("SIGINT", async () => {
  await closeDB();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeDB();
  process.exit(0);
});

module.exports = connectDB;
module.exports.closeDB = closeDB;
