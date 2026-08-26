function required(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function getAppOrigin() {
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendBrevoEmail({
  toEmail,
  toName,
  subject,
  textContent,
  htmlContent
}) {
  const apiKey = required("BREVO_API_KEY");
  const senderEmail = required("MAIL_FROM_EMAIL");
  const senderName = String(
    process.env.MAIL_FROM_NAME || "DCURS"
  ).trim();

  const response = await fetch(
    "https://api.brevo.com/v3/smtp/email",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: [
          {
            email: toEmail,
            name: toName || "Student"
          }
        ],
        subject,
        textContent,
        htmlContent
      })
    }
  );

  if (!response.ok) {
    let details = "";

    try {
      const data = await response.json();
      details = data?.message || data?.code || "";
    } catch {}

    console.error("Brevo API error:", {
      status: response.status,
      details
    });

    throw new Error(
      details
        ? `Brevo email API failed: ${details}`
        : `Brevo email API failed with status ${response.status}`
    );
  }

  return response.json();
}

async function sendVerificationEmail({
  email,
  name,
  token
}) {
  const verifyUrl =
    `${getAppOrigin()}/verify-email.html?token=` +
    encodeURIComponent(token);

  return sendBrevoEmail({
    toEmail: email,
    toName: name,
    subject: "Verify your DCURS email",
    textContent:
      `Hello ${name || "Student"},\n\n` +
      `Please verify your DCURS email using this link:\n` +
      `${verifyUrl}\n\n` +
      `This link expires in 24 hours.\n\n` +
      `If you did not register for DCURS, ` +
      `you can ignore this email.`,
    htmlContent:
      `<p>Hello ${escapeHtml(name || "Student")},</p>` +
      `<p>Please verify your DCURS email address.</p>` +
      `<p><a href="${verifyUrl}">Verify Email</a></p>` +
      `<p>This link expires in 24 hours.</p>` +
      `<p>If you did not register for DCURS, ` +
      `you can ignore this email.</p>`
  });
}

async function sendPasswordResetEmail({
  email,
  name,
  token
}) {
  const resetUrl =
    `${getAppOrigin()}/reset-password.html?token=` +
    encodeURIComponent(token);

  return sendBrevoEmail({
    toEmail: email,
    toName: name,
    subject: "Reset your DCURS password",
    textContent:
      `Hello ${name || "Student"},\n\n` +
      `Reset your DCURS password using this link:\n` +
      `${resetUrl}\n\n` +
      `This link expires in 30 minutes.\n\n` +
      `If you did not request a password reset, ` +
      `you can ignore this email.`,
    htmlContent:
      `<p>Hello ${escapeHtml(name || "Student")},</p>` +
      `<p>A password reset was requested for your ` +
      `DCURS account.</p>` +
      `<p><a href="${resetUrl}">Reset Password</a></p>` +
      `<p>This link expires in 30 minutes.</p>` +
      `<p>If you did not request this, ` +
      `you can ignore this email.</p>`
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
