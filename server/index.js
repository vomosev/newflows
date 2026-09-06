const express = require('express');
const cors = require('cors');

const config = require('./config/env');
const { testConnection, closePool } = require('./config/db');
const sessionMiddleware = require('./config/session');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const {
  notFoundHandler,
  errorHandler,
} = require('./middleware/errors');

const app = express();

app.disable('x-powered-by');

if (config.runtime.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);

app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', taskRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

let server = null;
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully.`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10000);

  forceExitTimer.unref();

  try {
    if (server && server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await closePool();
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error('Failed to shut down cleanly:', error);
    process.exit(1);
  }
}

async function startServer() {
  try {
    await testConnection();

    server = await new Promise((resolve, reject) => {
      const httpServer = app.listen(config.runtime.port, () => {
        httpServer.removeListener('error', reject);
        resolve(httpServer);
      });

      httpServer.once('error', reject);
    });

    server.on('error', (error) => {
      console.error('HTTP server error:', error);
      void shutdown('HTTP server error', 1);
    });

    console.log(
      `Newflows API listening on port ${config.runtime.port} in ${config.runtime.nodeEnv} mode.`,
    );
  } catch (error) {
    console.error('Unable to start the Newflows API:', error);

    try {
      await closePool();
    } catch (closeError) {
      console.error('Failed to close the database pool:', closeError);
    }

    process.exitCode = 1;
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void startServer();

module.exports = app;
