const session = require('express-session');
const database = require('./db');
const env = require('./env');

const pool = database.pool || database;
const sessionConfig = env.session || {};
const runtimeConfig = env.runtime || {};

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

class MySQLSessionStore extends session.Store {
  constructor(options = {}) {
    super();

    this.pool = options.pool;
    this.defaultMaxAge =
      Number(options.defaultMaxAge) > 0
        ? Number(options.defaultMaxAge)
        : DEFAULT_MAX_AGE_MS;
    this.cleanupInterval =
      Number(options.cleanupInterval) > 0
        ? Number(options.cleanupInterval)
        : DEFAULT_CLEANUP_INTERVAL_MS;

    if (!this.pool || typeof this.pool.execute !== 'function') {
      throw new TypeError(
        'MySQLSessionStore requires a mysql2/promise connection pool.'
      );
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        console.error('Failed to clean up expired sessions:', error);
      });
    }, this.cleanupInterval);

    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  serializeSession(sessionData) {
    return JSON.stringify(sessionData);
  }

  deserializeSession(serializedSession) {
    if (serializedSession === null || serializedSession === undefined) {
      return null;
    }

    if (Buffer.isBuffer(serializedSession)) {
      return JSON.parse(serializedSession.toString('utf8'));
    }

    if (typeof serializedSession === 'string') {
      return JSON.parse(serializedSession);
    }

    if (typeof serializedSession === 'object') {
      return serializedSession;
    }

    throw new TypeError('Stored session data has an unsupported format.');
  }

  serialize(sessionData) {
    return this.serializeSession(sessionData);
  }

  deserialize(serializedSession) {
    return this.deserializeSession(serializedSession);
  }

  getExpiration(sessionData) {
    const cookie = sessionData && sessionData.cookie ? sessionData.cookie : {};

    if (cookie.expires) {
      const expiration = new Date(cookie.expires);

      if (!Number.isNaN(expiration.getTime())) {
        return expiration;
      }
    }

    const maxAge = Number(cookie.originalMaxAge || cookie.maxAge);

    return new Date(
      Date.now() + (maxAge > 0 ? maxAge : this.defaultMaxAge)
    );
  }

  get(sessionId, callback) {
    const done = typeof callback === 'function' ? callback : () => {};

    this.pool
      .execute(
        `SELECT session_data
           FROM sessions
          WHERE session_id = ?
            AND expires_at > CURRENT_TIMESTAMP
          LIMIT 1`,
        [sessionId]
      )
      .then(([rows]) => {
        if (!rows.length) {
          done(null, null);
          return;
        }

        try {
          done(null, this.deserializeSession(rows[0].session_data));
        } catch (error) {
          done(error);
        }
      })
      .catch((error) => {
        done(error);
      });
  }

  set(sessionId, sessionData, callback) {
    const done = typeof callback === 'function' ? callback : () => {};

    let serializedSession;
    let expiresAt;

    try {
      serializedSession = this.serializeSession(sessionData);
      expiresAt = this.getExpiration(sessionData);
    } catch (error) {
      done(error);
      return;
    }

    this.pool
      .execute(
        `INSERT INTO sessions (session_id, session_data, expires_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           session_data = VALUES(session_data),
           expires_at = VALUES(expires_at)`,
        [sessionId, serializedSession, expiresAt]
      )
      .then(() => {
        done(null);
      })
      .catch((error) => {
        done(error);
      });
  }

  destroy(sessionId, callback) {
    const done = typeof callback === 'function' ? callback : () => {};

    this.pool
      .execute('DELETE FROM sessions WHERE session_id = ?', [sessionId])
      .then(() => {
        done(null);
      })
      .catch((error) => {
        done(error);
      });
  }

  touch(sessionId, sessionData, callback) {
    const done = typeof callback === 'function' ? callback : () => {};

    let expiresAt;

    try {
      expiresAt = this.getExpiration(sessionData);
    } catch (error) {
      done(error);
      return;
    }

    this.pool
      .execute(
        `UPDATE sessions
            SET expires_at = ?
          WHERE session_id = ?`,
        [expiresAt, sessionId]
      )
      .then(() => {
        done(null);
      })
      .catch((error) => {
        done(error);
      });
  }

  async cleanupExpiredSessions() {
    await this.pool.execute(
      'DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'
    );
  }

  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

const nodeEnv = runtimeConfig.nodeEnv || process.env.NODE_ENV || 'development';

const isProduction = nodeEnv === 'production';

const secret = sessionConfig.secret || process.env.SESSION_SECRET;

if (!secret) {
  throw new Error('SESSION_SECRET is required to configure session middleware.');
}

const cookieMaxAge =
  Number(
    sessionConfig.cookieMaxAge ||
      sessionConfig.maxAge ||
      sessionConfig.cookieMaxAgeMs
  ) || DEFAULT_MAX_AGE_MS;

const store = new MySQLSessionStore({
  pool,
  defaultMaxAge: cookieMaxAge,
  cleanupInterval:
    sessionConfig.cleanupIntervalMs || DEFAULT_CLEANUP_INTERVAL_MS,
});

const sessionMiddleware = session({
  name: sessionConfig.cookieName || 'newflows.sid',
  secret,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: false,
  unset: 'destroy',
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: cookieMaxAge,
    path: '/',
  },
});

module.exports = sessionMiddleware;
module.exports.sessionMiddleware = sessionMiddleware;
module.exports.MySQLSessionStore = MySQLSessionStore;
module.exports.store = store;
