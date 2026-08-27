const express = require("express");
const { setAuditWriter } = require("./security");

async function setupPersistentAudit(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs(
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      actor_type TEXT,
      actor_id INTEGER,
      target_type TEXT,
      target_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs(action);
  `);

  setAuditWriter(async entry => {
    const {
      timestamp,
      action,
      actor_type = null,
      actor_id = null,
      target_type = null,
      target_id = null,
      ...details
    } = entry;

    await pool.query(`
      INSERT INTO audit_logs(
        action,
        actor_type,
        actor_id,
        target_type,
        target_id,
        details,
        created_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `, [
      action,
      actor_type,
      actor_id,
      target_type,
      target_id,
      JSON.stringify(details || {}),
      timestamp ? new Date(timestamp) : new Date()
    ]);
  });
}

function mountAuditRoutes(app, pool, requireAdmin) {
  const router = express.Router();

  router.use(requireAdmin);

  router.get("/", async (req, res) => {
    try {
      const requestedLimit = Number(req.query.limit || 100);
      const limit = Math.max(1, Math.min(requestedLimit, 500));
      const action = String(req.query.action || "").trim();

      let result;

      if (action) {
        result = await pool.query(`
          SELECT
            id,
            action,
            actor_type,
            actor_id,
            target_type,
            target_id,
            details,
            created_at
          FROM audit_logs
          WHERE action ILIKE $1
          ORDER BY created_at DESC
          LIMIT $2
        `, [`%${action}%`, limit]);
      } else {
        result = await pool.query(`
          SELECT
            id,
            action,
            actor_type,
            actor_id,
            target_type,
            target_id,
            details,
            created_at
          FROM audit_logs
          ORDER BY created_at DESC
          LIMIT $1
        `, [limit]);
      }

      res.json(result.rows);
    } catch (error) {
      console.error("Audit log read error:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  });

  router.get("/stats", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE created_at >= NOW() - INTERVAL '24 hours'
          )::int AS last_24_hours,
          COUNT(*) FILTER (
            WHERE action ILIKE '%login_failed%'
          )::int AS failed_logins,
          COUNT(*) FILTER (
            WHERE action ILIKE 'admin_%'
          )::int AS admin_actions
        FROM audit_logs
      `);

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Audit stats error:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  });

  app.use("/api/admin/audit-logs", router);
}

module.exports = {
  setupPersistentAudit,
  mountAuditRoutes
};
