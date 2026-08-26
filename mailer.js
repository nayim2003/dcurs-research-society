const nodemailer = require("nodemailer");

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function createTransporter() {
  const port = Number(required("SMTP_PORT"));

  return nodemailer.createTransport({
    host: required("SMTP_HOST"),
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: required("SMTP_USER"),
      pass: required("SMTP_PASS")
    }
  });
}

function appOrigin() {
  const configured = String(process.env.APP_ORIGIN || "").trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  throw new Error("APP_ORIGIN is missing");
}

async function sendVerificationEmail({ email, name, token }) {
  const transporter = createTransporter();
  const verifyUrl =
    `${appOrigin()}/verify-email.html?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from: required("MAIL_FROM"),
    to: email,
    subject: "Verify your DCURS email",
    text:
      `Hello ${name || "Student"},\n\n` +
      `Verify your DCURS email by opening this link:\n${verifyUrl}\n\n` +
      `This link expires in 24 hours.\n\n` +
      `If you did not register for DCURS, you can ignore this email.`,
    html:
      `<p>Hello ${escapeHtml(name || "Student")},</p>` +
      `<p>Please verify your DCURS email address.</p>` +
      `<p><a href="${verifyUrl}">Verify Email</a></p>` +
      `<p>This link expires in 24 hours.</p>` +
      `<p>If you did not register for DCURS, you can ignore this email.</p>`
  });
}

async function sendPasswordResetEmail({ email, name, token }) {
  const transporter = createTransporter();
  const resetUrl =
    `${appOrigin()}/reset-password.html?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from: required("MAIL_FROM"),
    to: email,
    subject: "Reset your DCURS password",
    text:
      `Hello ${name || "Student"},\n\n` +
      `Reset your DCURS password using this link:\n${resetUrl}\n\n` +
      `This link expires in 30 minutes.\n\n` +
      `If you did not request a password reset, you can ignore this email.`,
    html:
      `<p>Hello ${escapeHtml(name || "Student")},</p>` +
      `<p>A password reset was requested for your DCURS account.</p>` +
      `<p><a href="${resetUrl}">Reset Password</a></p>` +
      `<p>This link expires in 30 minutes.</p>` +
      `<p>If you did not request this, you can ignore this email.</p>`
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
