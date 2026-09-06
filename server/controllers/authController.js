const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { validateSignup, validateLogin } = require('../utils/validation');
const { HttpError } = require('../middleware/errors');

const PASSWORD_HASH_ROUNDS = 12;
const SESSION_COOKIE_NAME = 'connect.sid';

function hasValidationErrors(errors) {
  if (!errors) {
    return false;
  }

  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  return typeof errors === 'object' && Object.keys(errors).length > 0;
}

function unpackValidationResult(result, fallbackValues) {
  if (!result || typeof result !== 'object') {
    return {
      errors: {},
      values: fallbackValues,
    };
  }

  return {
    errors: result.errors || {},
    values:
      result.values ||
      result.value ||
      result.data ||
      result.sanitizedValues ||
      result.sanitized ||
      fallbackValues,
  };
}

function toSafeUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getClearCookieOptions(sessionCookie) {
  const options = {
    path: sessionCookie?.path || '/',
  };

  if (typeof sessionCookie?.httpOnly === 'boolean') {
    options.httpOnly = sessionCookie.httpOnly;
  }

  if (typeof sessionCookie?.secure === 'boolean') {
    options.secure = sessionCookie.secure;
  }

  if (sessionCookie?.sameSite !== undefined) {
    options.sameSite = sessionCookie.sameSite;
  }

  if (sessionCookie?.domain) {
    options.domain = sessionCookie.domain;
  }

  return options;
}

async function signup(req, res) {
  const requestBody = req.body || {};
  const normalizedInput = {
    ...requestBody,
    email:
      typeof requestBody.email === 'string'
        ? requestBody.email.trim().toLowerCase()
        : requestBody.email,
  };

  const validation = unpackValidationResult(
    validateSignup(normalizedInput),
    normalizedInput
  );

  if (hasValidationErrors(validation.errors)) {
    throw new HttpError(400, 'Please correct the highlighted fields.', validation.errors);
  }

  const values = {
    ...validation.values,
    email:
      typeof validation.values.email === 'string'
        ? validation.values.email.trim().toLowerCase()
        : validation.values.email,
  };

  const passwordHash = await bcrypt.hash(values.password, PASSWORD_HASH_ROUNDS);

  let result;

  try {
    [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash)
       VALUES (?, ?, ?)`,
      [values.name, values.email, passwordHash]
    );
  } catch (error) {
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      throw new HttpError(
        409,
        'An account with this email address already exists.',
        { email: 'An account with this email address already exists.' }
      );
    }

    throw error;
  }

  const [rows] = await pool.execute(
    `SELECT id, name, email, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );

  if (rows.length === 0) {
    throw new HttpError(500, 'The account was created but could not be loaded.');
  }

  await regenerateSession(req);
  req.session.userId = Number(rows[0].id);
  await saveSession(req);

  res.status(201).json({
    user: toSafeUser(rows[0]),
  });
}

async function login(req, res) {
  const requestBody = req.body || {};
  const normalizedInput = {
    ...requestBody,
    email:
      typeof requestBody.email === 'string'
        ? requestBody.email.trim().toLowerCase()
        : requestBody.email,
  };

  const validation = unpackValidationResult(
    validateLogin(normalizedInput),
    normalizedInput
  );

  if (hasValidationErrors(validation.errors)) {
    throw new HttpError(400, 'Please correct the highlighted fields.', validation.errors);
  }

  const values = {
    ...validation.values,
    email:
      typeof validation.values.email === 'string'
        ? validation.values.email.trim().toLowerCase()
        : validation.values.email,
  };

  const [rows] = await pool.execute(
    `SELECT id, name, email, password_hash, created_at
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [values.email]
  );

  if (rows.length === 0) {
    throw new HttpError(401, 'Invalid email address or password.');
  }

  const user = rows[0];
  const passwordMatches = await bcrypt.compare(values.password, user.password_hash);

  if (!passwordMatches) {
    throw new HttpError(401, 'Invalid email address or password.');
  }

  await regenerateSession(req);
  req.session.userId = Number(user.id);
  await saveSession(req);

  res.status(200).json({
    user: toSafeUser(user),
  });
}

async function logout(req, res) {
  const clearCookieOptions = getClearCookieOptions(req.session?.cookie);
  let destroyError = null;

  try {
    await destroySession(req);
  } catch (error) {
    destroyError = error;
  }

  res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions);

  if (destroyError) {
    throw destroyError;
  }

  res.status(200).json({
    message: 'Logged out successfully.',
  });
}

async function me(req, res) {
  const userId = req.session?.userId;

  if (!userId) {
    throw new HttpError(401, 'Authentication is required.');
  }

  const [rows] = await pool.execute(
    `SELECT id, name, email, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    const clearCookieOptions = getClearCookieOptions(req.session?.cookie);

    try {
      await destroySession(req);
    } finally {
      res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions);
    }

    throw new HttpError(401, 'Your session is no longer valid.');
  }

  res.status(200).json({
    user: toSafeUser(rows[0]),
  });
}

module.exports = {
  signup,
  login,
  logout,
  me,
};