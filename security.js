const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

function requireEnvironment() {
  const required = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD"
  ];

  const missing = required.filter(name => !process.env[name]);

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }

  if (process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }
}

function buildAllowedOrigins() {
  const origins = new Set(
    String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );

  // Render exposes this automatically for a Web Service.
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    origins.add(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

function configureSecurity(app) {
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Current DCURS HTML uses inline scripts, so strict CSP would break the site.
  // Helmet still applies the other important security headers.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  const allowedOrigins = buildAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin = server-to-server/curl/same-origin navigation.
        if (!origin) return callback(null, true);

        if (allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Origin not allowed"));
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      maxAge: 86400
    })
  );

  app.use((req, res, next) => {
    if (
      process.env.NODE_ENV === "production" &&
      req.headers["x-forwarded-proto"] &&
      req.headers["x-forwarded-proto"] !== "https"
    ) {
      return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

const studentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Try again later."
  }
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many admin login attempts. Try again later."
  }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many registration attempts. Try again later."
  }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many upload attempts. Try again later."
  }
});

function audit(action, details = {}) {
  const safe = {
    timestamp: new Date().toISOString(),
    action,
    ...details
  };

  // Never include passwords, JWTs, session secrets or API secrets here.
  console.log("[AUDIT]", JSON.stringify(safe));
}

module.exports = {
  requireEnvironment,
  configureSecurity,
  studentLoginLimiter,
  adminLoginLimiter,
  registrationLimiter,
  uploadLimiter,
  audit
};
