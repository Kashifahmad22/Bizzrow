function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status =
    err.statusCode || err.status || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  if (status >= 500) {
    console.error("[request error]", { method: req.method, path: req.path, status, error: err });
  }
  res.status(status).json({
    message: process.env.NODE_ENV === "production" && status >= 500
      ? "Internal server error" : err.message || "Internal server error",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
}

module.exports = { notFound, errorHandler };
