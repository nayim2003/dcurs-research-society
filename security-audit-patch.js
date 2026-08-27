// SECURITY.JS AUDIT PATCH
// Merge these changes into your existing security.js.
//
// 1) Add this near the top-level of the file:
let auditWriter = null;

function setAuditWriter(writer) {
  auditWriter = typeof writer === "function" ? writer : null;
}

// 2) Replace your current audit() function with this:
function audit(action, details = {}) {
  const safe = {
    timestamp: new Date().toISOString(),
    action,
    ...details
  };

  // Never include passwords, JWTs, session secrets or API secrets.
  console.log("[AUDIT]", JSON.stringify(safe));

  if (auditWriter) {
    Promise.resolve(auditWriter(safe)).catch(error => {
      console.error("Persistent audit write failed:", error);
    });
  }
}

// 3) Add setAuditWriter to module.exports:
module.exports = {
  // ...keep all your existing exports...
  setAuditWriter,
  audit
};
