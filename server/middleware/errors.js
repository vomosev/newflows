const config = require("../config/env");

const runtimeEnvironment =
  config.runtime?.nodeEnv ??
  config.runtime?.environment ??
  config.nodeEnv ??
  config.NODE_ENV ??
  "development";

const isProduction = runtimeEnvironment === "production";

class HttpError extends Error {
  constructor(statusCode, message, details = undefined, code = undefined) {
    super(message || "An error occurred.");
    this.name = "HttpError";
    this.statusCode =
      Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
        ? statusCode
        : 500;
    this.status = this.statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace?.(this, HttpError);
  }
}

function asyncHandler(handler) {
  if (typeof handler !== "function") {
    throw new TypeError("asyncHandler requires a route handler function.");
  }

  return function wrappedAsyncHandler(req, res, next) {
    return Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}

function notFoundHandler(req, res, next) {
  next(
    new HttpError(
      404,
      `Route not found: ${req.method} ${req.originalUrl || req.url}`,
      undefined,
      "ROUTE_NOT_FOUND"
    )
  );
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let err = error;

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    err = new HttpError(
      400,
      "The request body contains invalid JSON.",
      undefined,
      "INVALID_JSON"
    );
  }

  const declaredStatus = Number(err?.statusCode ?? err?.status);
  const validDeclaredStatus =
    Number.isInteger(declaredStatus) &&
    declaredStatus >= 400 &&
    declaredStatus <= 599;

  const isOperational =
    err instanceof HttpError ||
    err?.isOperational === true ||
    err?.expose === true ||
    (validDeclaredStatus && declaredStatus < 500);

  const statusCode = isOperational && validDeclaredStatus ? declaredStatus : 500;

  if (!isOperational) {
    console.error("Unexpected request failure", {
      method: req.method,
      path: req.originalUrl || req.url,
      message: err?.message || String(err),
      stack: err?.stack,
    });
  }

  const message =
    statusCode === 500 && config.runtime.isProduction && !isOperational
      ? "An unexpected server error occurred."
      : err?.message || "An unexpected server error occurred.";

  const response = { error: message };

  if (isOperational && err?.code) {
    response.code = err.code;
  }

  if (isOperational && err?.details !== undefined) {
    response.details = err.details;
  }

  if (!config.runtime.isProduction && !isOperational && err?.stack) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  HttpError,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};