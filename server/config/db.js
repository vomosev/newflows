const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function testConnection() {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.ping();
    return true;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  testConnection,
  closePool,
};

module.exports.default = module.exports;