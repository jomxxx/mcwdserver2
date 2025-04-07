const mysql = require("mysql2/promise");
const sshClient = require("ssh2").Client;

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

async function connectDB(retries = 3, delay = 2000) {
  if (pool) return pool; // ✅ Reuse existing pool

  const ssh = new sshClient();

  return new Promise((resolve, reject) => {
    const attemptConnection = (retryCount) => {
      ssh
        .on("ready", () => {
          ssh.forwardOut(
            "127.0.0.1",
            3306,
            dbConfig.host,
            3306,
            (err, stream) => {
              if (err) {
                ssh.end();
                if (retryCount > 0) {
                  console.warn(
                    `SSH Tunnel Error: ${err.message}. Retrying in ${delay}ms...`
                  );
                  setTimeout(() => attemptConnection(retryCount - 1), delay);
                } else {
                  return reject(
                    new Error("SSH Tunnel Error: " + err.message)
                  );
                }
              } else {
                pool = mysql.createPool({
                  ...dbConfig,
                  stream,
                  waitForConnections: true,
                  connectionLimit: 20, // Increased connection limit
                  queueLimit: 0,
                  connectTimeout: 30000, // Increased timeout
                });
                resolve(pool);
              }
            }
          );
        })
        .on("error", (err) => {
          if (retryCount > 0) {
            console.warn(
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
        .connect(sshConfig);
    };

    attemptConnection(retries);
  });
}

module.exports = connectDB;
