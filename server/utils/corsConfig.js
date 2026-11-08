const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function createCorsOptions(env = process.env) {
  const configuredOrigins = [env.CLIENT_ORIGIN || "http://localhost:5173"]
    .map((origin) => origin.trim().replace(/\/$/, ""));
  const allowedOrigins = new Set(configuredOrigins);

  if (env.NODE_ENV !== "production") {
    for (const origin of LOCAL_DEVELOPMENT_ORIGINS) allowedOrigins.add(origin);
    for (const origin of (env.CLIENT_ORIGINS || "").split(",")) {
      const normalized = origin.trim().replace(/\/$/, "");
      if (normalized) allowedOrigins.add(normalized);
    }
  }

  return {
    origin: [...allowedOrigins],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    exposedHeaders: ["Content-Disposition"],
  };
}

module.exports = { createCorsOptions };
