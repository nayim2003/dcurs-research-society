DCURS AUDIT LOG + BACKUP PHASE

This update is intentionally NON-DESTRUCTIVE.
It does not include a replacement server.js because your current server already
contains working Email Verification, Brevo API email, Cloudinary uploads and
security changes. Replacing it with an older full server could remove those features.

ADD:
- audit-db.js
- public/admin-audit.html
- scripts/backup-db.ps1
- scripts/backup-db.sh

PATCH:
- security.js using security-audit-patch.js
- server.js using SERVER_AUDIT_PATCH.txt
- .gitignore using GITIGNORE_BACKUP_PATCH.txt

After the server patch:
Admin audit page:
  /admin-audit.html

It records the audit(...) calls already present in your secure server into PostgreSQL.

BACKUP:
Read BACKUP_SETUP.txt before relying on the current Free Render database.
