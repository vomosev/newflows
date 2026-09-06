'use strict';

const dotenv = require('dotenv');

const dotenvResult = dotenv.config();

if (
  dotenvResult.error &&
  dotenvResult.error.code !== 'ENOENT'
) {
  throw new Error(`Unable to load environment variables: ${dotenvResult.error.message}`);
}

function getRequiredVariable(name, { preserveWhitespace = false } = {}) {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return preserveWhitespace ? value : value.trim();
}

function parsePort(name) {
  const value = getRequiredVariable(name);

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return port;
}

function parseNodeEnvironment() {
  const nodeEnv = getRequiredVariable('NODE_ENV').toLowerCase();
  const allowedEnvironments = new Set(['development', 'test', 'production']);

  if (!allowedEnvironments.has(nodeEnv)) {
    throw new Error('NODE_ENV must be one of: development, test, production');
  }

  return nodeEnv;
}

function parseClientOrigin() {
  const value = getRequiredVariable('CLIENT_ORIGIN');

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error('CLIENT_ORIGIN must be a valid absolute HTTP or HTTPS origin');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('CLIENT_ORIGIN must use the http or https protocol');
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new Error('CLIENT_ORIGIN must contain only a scheme, hostname, and optional port');
  }

  return url.origin;
}

const nodeEnv = parseNodeEnvironment();

const database = Object.freeze({
  host: getRequiredVariable('DB_HOST'),
  port: parsePort('DB_PORT'),
  user: getRequiredVariable('DB_USER'),
  password: getRequiredVariable('DB_PASSWORD', { preserveWhitespace: true }),
  name: getRequiredVariable('DB_NAME')
});

const cors = Object.freeze({
  origin: parseClientOrigin(),
  credentials: true
});

const session = Object.freeze({
  secret: getRequiredVariable('SESSION_SECRET', { preserveWhitespace: true }),
  secureCookie: nodeEnv === 'production'
});

const runtime = Object.freeze({
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port: parsePort('SERVER_PORT')
});

module.exports = Object.freeze({
  database,
  cors,
  session,
  runtime
});

module.exports.default = module.exports;