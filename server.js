const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const {
  upload,
  uploadPdfBuffer,
  deleteCloudFile
} = require("./storage");

const {
  requireEnvironment,
  configureSecurity,
  studentLoginLimiter,
  adminLoginLimiter,
  registrationLimiter,
  uploadLimiter,
  audit
} = require("./security");

requireEnvironment();

const app = express();
const SECRET = process.env.SESSION_SECRET;

configureSecurity(app);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({
  extended: true,
  limit: "100kb"
}));
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      department TEXT,
      campus TEXT,
      student_id TEXT,
      research_interest TEXT,
      bio TEXT,
      status TEXT DEFAULT 'Pending'
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS campus TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects(
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      title TEXT,
      area TEXT,
      abstract TEXT,
      supervisor TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS publications(
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      title TEXT,
      journal TEXT,
      year TEXT,
      area TEXT,
      link TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events(
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATE NOT NULL,
      event_time TEXT,
      venue TEXT,
      campus TEXT,
      registration_deadline DATE,
      capacity INTEGER,
      status TEXT DEFAULT 'Published',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_registrations(
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, student_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications(
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'Info',
      audience TEXT DEFAULT 'all',
      campus TEXT,
      target_student_id INTEGER,
      published BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_reads(
      id SERIAL PRIMARY KEY,
      notification_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(notification_id, student_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents(
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'Research Paper',
      description TEXT,
      file_url TEXT NOT NULL,
      file_public_id TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      file_size BIGINT,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Database ready");
}

createTables().catch(error => {
  console.error("Database setup failed:", error);
  process.exit(1);
});

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function requireStudent(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, SECRET);

    if (decoded.role !== "student") {
      return res.status(403).json({ error: "Access denied" });
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

function requireAdmin(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 72
  );
}

const allowedStatuses = new Set(["Pending", "Approved", "Rejected"]);

/* =========================
   AUTH
========================= */

app.post(
  "/api/register",
  registrationLimiter,
  async (req, res) => {
    try {
      const {
        name,
        password,
        department,
        campus,
        student_id,
        research_interest
      } = req.body;

      const email = normalizeEmail(req.body.email);
      const confirmPassword =
        req.body.confirm_password ??
        req.body.confirmPassword;

      if (!name || !email || !password || !department) {
        return res.status(400).json({
          error: "Please complete all required fields."
        });
      }

      if (!validPassword(password)) {
        return res.status(400).json({
          error: "Password must be between 8 and 72 characters."
        });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({
          error: "Password and confirm password do not match."
        });
      }

      const hash = await bcrypt.hash(password, 12);

      await pool.query(`
        INSERT INTO users
        (name,email,password,department,campus,student_id,research_interest)
        VALUES($1,$2,$3,$4,$5,$6,$7)
      `, [
        String(name).trim(),
        email,
        hash,
        String(department).trim(),
        campus || null,
        student_id || null,
        research_interest || null
      ]);

      audit("student_registration_submitted");

      res.json({
        success: true,
        message: "Registration submitted"
      });
    } catch (error) {
      if (error.code === "23505") {
        // Keep registration response reasonably generic.
        return res.status(400).json({
          error: "Unable to create this account. Check the information and try again."
        });
      }

      console.error("Registration error:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  }
);

app.post(
  "/api/login",
  studentLoginLimiter,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = String(req.body.password || "");

      const result = await pool.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
      );

      const user = result.rows[0];

      if (!user) {
        audit("student_login_failed");
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        audit("student_login_failed");
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      if (user.status !== "Approved") {
        return res.status(403).json({
          error: "Account is not approved yet"
        });
      }

      const token = jwt.sign(
        {
          id: user.id,
          role: "student"
        },
        SECRET,
        {
          expiresIn: "1d",
          issuer: "dcurs",
          audience: "dcurs-student"
        }
      );

      audit("student_login_success", { user_id: user.id });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          department: user.department,
          campus: user.campus,
          student_id: user.student_id,
          research_interest: user.research_interest,
          bio: user.bio,
          status: user.status
        }
      });
    } catch (error) {
      console.error("Student login error:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  }
);

app.post(
  "/api/admin/login",
  adminLoginLimiter,
  async (req, res) => {
    try {
      const username = String(req.body.username || "");
      const password = String(req.body.password || "");

      const usernameMatch =
        username.length === process.env.ADMIN_USERNAME.length &&
        username === process.env.ADMIN_USERNAME;

      const passwordMatch =
        password.length === process.env.ADMIN_PASSWORD.length &&
        password === process.env.ADMIN_PASSWORD;

      if (!usernameMatch || !passwordMatch) {
        audit("admin_login_failed");
        return res.status(401).json({
          error: "Invalid username or password"
        });
      }

      const token = jwt.sign(
        { role: "admin" },
        SECRET,
        {
          expiresIn: "2h",
          issuer: "dcurs",
          audience: "dcurs-admin"
        }
      );

      audit("admin_login_success");

      res.json({ token });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Something went wrong" });
    }
  }
);

/* =========================
   ADMIN STUDENTS
========================= */

app.get("/api/applications", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,name,email,department,campus,student_id,
        research_interest,bio,status
      FROM users
      WHERE role='student'
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Applications read error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/applications/:id", requireAdmin, async (req, res) => {
  try {
    if (!allowedStatuses.has(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await pool.query(`
      UPDATE users
      SET status=$1
      WHERE id=$2
    `, [req.body.status, req.params.id]);

    audit("admin_student_status_change", {
      target_user_id: Number(req.params.id),
      status: req.body.status
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Student status error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   STUDENT PROFILE
========================= */

app.get("/api/profile", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,name,email,department,campus,student_id,
        research_interest,bio,status
      FROM users
      WHERE id=$1
    `, [req.user.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Profile read error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/profile", requireStudent, async (req, res) => {
  try {
    const {
      name,
      department,
      campus,
      student_id,
      research_interest,
      bio
    } = req.body;

    if (!name || !department) {
      return res.status(400).json({
        error: "Name and department are required"
      });
    }

    const result = await pool.query(`
      UPDATE users
      SET
        name=$1,
        department=$2,
        campus=$3,
        student_id=$4,
        research_interest=$5,
        bio=$6
      WHERE id=$7
      RETURNING
        id,name,email,department,campus,student_id,
        research_interest,bio,status
    `, [
      String(name).trim(),
      String(department).trim(),
      campus || null,
      student_id || null,
      research_interest || null,
      bio || null,
      req.user.id
    ]);

    audit("student_profile_updated", { user_id: req.user.id });

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   PROJECTS
========================= */

app.post("/api/projects", requireStudent, async (req, res) => {
  try {
    const { title, area, abstract, supervisor } = req.body;

    if (!title || !area) {
      return res.status(400).json({
        error: "Project title and research area are required"
      });
    }

    await pool.query(`
      INSERT INTO projects
      (student_id,title,area,abstract,supervisor)
      VALUES($1,$2,$3,$4,$5)
    `, [
      req.user.id,
      title,
      area,
      abstract || null,
      supervisor || null
    ]);

    audit("project_submitted", { user_id: req.user.id });

    res.json({
      success: true,
      message: "Project submitted successfully"
    });
  } catch (error) {
    console.error("Project submit error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/projects/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM projects
      WHERE student_id=$1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Student projects error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/projects", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM projects
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Admin projects error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/projects/:id", requireAdmin, async (req, res) => {
  try {
    if (!allowedStatuses.has(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await pool.query(`
      UPDATE projects
      SET status=$1
      WHERE id=$2
    `, [req.body.status, req.params.id]);

    audit("admin_project_status_change", {
      project_id: Number(req.params.id),
      status: req.body.status
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Project status error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   PUBLICATIONS
========================= */

app.post("/api/publications", requireStudent, async (req, res) => {
  try {
    const { title, journal, year, area, link } = req.body;

    if (!title || !journal) {
      return res.status(400).json({
        error: "Publication title and journal/conference are required"
      });
    }

    await pool.query(`
      INSERT INTO publications
      (student_id,title,journal,year,area,link)
      VALUES($1,$2,$3,$4,$5,$6)
    `, [
      req.user.id,
      title,
      journal,
      year || null,
      area || null,
      link || null
    ]);

    audit("publication_submitted", { user_id: req.user.id });

    res.json({
      success: true,
      message: "Publication submitted successfully"
    });
  } catch (error) {
    console.error("Publication submit error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/publications/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM publications
      WHERE student_id=$1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Student publications error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/publications", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM publications
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Admin publications error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/publications/:id", requireAdmin, async (req, res) => {
  try {
    if (!allowedStatuses.has(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await pool.query(`
      UPDATE publications
      SET status=$1
      WHERE id=$2
    `, [req.body.status, req.params.id]);

    audit("admin_publication_status_change", {
      publication_id: Number(req.params.id),
      status: req.body.status
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Publication status error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   EVENTS
========================= */

app.get("/api/public/events", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,e.title,e.description,e.event_date,e.event_time,
        e.venue,e.campus,e.registration_deadline,e.capacity,e.status,
        COUNT(r.id)::int AS registered_count
      FROM events e
      LEFT JOIN event_registrations r ON r.event_id=e.id
      WHERE e.status='Published'
      GROUP BY e.id
      ORDER BY e.event_date ASC,e.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Public events error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/events/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        EXISTS(
          SELECT 1
          FROM event_registrations r
          WHERE r.event_id=e.id
          AND r.student_id=$1
        ) AS registered,
        (
          SELECT COUNT(*)::int
          FROM event_registrations r2
          WHERE r2.event_id=e.id
        ) AS registered_count
      FROM events e
      WHERE e.status='Published'
      ORDER BY e.event_date ASC,e.id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Student events error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/events/:id/register", requireStudent, async (req, res) => {
  try {
    const eventResult = await pool.query(`
      SELECT *
      FROM events
      WHERE id=$1
      AND status='Published'
    `, [req.params.id]);

    if (!eventResult.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventResult.rows[0];

    if (event.registration_deadline) {
      const deadline = new Date(event.registration_deadline);
      deadline.setHours(23, 59, 59, 999);

      if (new Date() > deadline) {
        return res.status(400).json({
          error: "Registration deadline has passed"
        });
      }
    }

    if (event.capacity) {
      const countResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM event_registrations
        WHERE event_id=$1
      `, [req.params.id]);

      if (countResult.rows[0].count >= event.capacity) {
        return res.status(400).json({
          error: "Event capacity is full"
        });
      }
    }

    await pool.query(`
      INSERT INTO event_registrations(event_id,student_id)
      VALUES($1,$2)
      ON CONFLICT(event_id,student_id) DO NOTHING
    `, [req.params.id, req.user.id]);

    audit("event_registration", {
      user_id: req.user.id,
      event_id: Number(req.params.id)
    });

    res.json({
      success: true,
      message: "Event registration successful"
    });
  } catch (error) {
    console.error("Event registration error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.delete("/api/events/:id/register", requireStudent, async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM event_registrations
      WHERE event_id=$1
      AND student_id=$2
    `, [req.params.id, req.user.id]);

    res.json({
      success: true,
      message: "Registration cancelled"
    });
  } catch (error) {
    console.error("Event cancellation error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/admin/events", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        COUNT(r.id)::int AS registered_count
      FROM events e
      LEFT JOIN event_registrations r ON r.event_id=e.id
      GROUP BY e.id
      ORDER BY e.event_date DESC,e.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Admin events error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/admin/events", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      event_date,
      event_time,
      venue,
      campus,
      registration_deadline,
      capacity,
      status
    } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({
        error: "Event title and date are required"
      });
    }

    const result = await pool.query(`
      INSERT INTO events(
        title,description,event_date,event_time,venue,campus,
        registration_deadline,capacity,status
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      title,
      description || null,
      event_date,
      event_time || null,
      venue || null,
      campus || null,
      registration_deadline || null,
      capacity || null,
      status === "Draft" ? "Draft" : "Published"
    ]);

    audit("admin_event_created", { event_id: result.rows[0].id });

    res.json({
      success: true,
      event: result.rows[0]
    });
  } catch (error) {
    console.error("Event create error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/admin/events/:id", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      event_date,
      event_time,
      venue,
      campus,
      registration_deadline,
      capacity,
      status
    } = req.body;

    const result = await pool.query(`
      UPDATE events
      SET
        title=$1,
        description=$2,
        event_date=$3,
        event_time=$4,
        venue=$5,
        campus=$6,
        registration_deadline=$7,
        capacity=$8,
        status=$9
      WHERE id=$10
      RETURNING *
    `, [
      title,
      description || null,
      event_date,
      event_time || null,
      venue || null,
      campus || null,
      registration_deadline || null,
      capacity || null,
      status === "Draft" ? "Draft" : "Published",
      req.params.id
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    audit("admin_event_updated", {
      event_id: Number(req.params.id)
    });

    res.json({
      success: true,
      event: result.rows[0]
    });
  } catch (error) {
    console.error("Event update error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM event_registrations
      WHERE event_id=$1
    `, [req.params.id]);

    await pool.query(`
      DELETE FROM events
      WHERE id=$1
    `, [req.params.id]);

    audit("admin_event_deleted", {
      event_id: Number(req.params.id)
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Event delete error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/admin/events/:id/attendees", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,u.name,u.email,u.department,u.campus,
        u.student_id,r.registered_at
      FROM event_registrations r
      JOIN users u ON u.id=r.student_id
      WHERE r.event_id=$1
      ORDER BY r.registered_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Attendees error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   NOTIFICATIONS
========================= */

app.get("/api/notifications/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        n.id,n.title,n.message,n.type,n.audience,
        n.campus,n.created_at,
        (nr.id IS NOT NULL) AS is_read
      FROM notifications n
      JOIN users u ON u.id=$1
      LEFT JOIN notification_reads nr
        ON nr.notification_id=n.id
        AND nr.student_id=$1
      WHERE n.published=TRUE
      AND (
        n.audience='all'
        OR (n.audience='campus' AND n.campus=u.campus)
        OR (n.audience='student' AND n.target_student_id=u.id)
      )
      ORDER BY n.created_at DESC,n.id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Notifications error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/notifications/:id/read", requireStudent, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO notification_reads(notification_id,student_id)
      VALUES($1,$2)
      ON CONFLICT(notification_id,student_id) DO NOTHING
    `, [req.params.id, req.user.id]);

    res.json({ success: true });
  } catch (error) {
    console.error("Notification read error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/notifications/read-all", requireStudent, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO notification_reads(notification_id,student_id)
      SELECT n.id,$1
      FROM notifications n
      JOIN users u ON u.id=$1
      WHERE n.published=TRUE
      AND (
        n.audience='all'
        OR (n.audience='campus' AND n.campus=u.campus)
        OR (n.audience='student' AND n.target_student_id=u.id)
      )
      ON CONFLICT(notification_id,student_id) DO NOTHING
    `, [req.user.id]);

    res.json({ success: true });
  } catch (error) {
    console.error("Read all notification error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/admin/notifications", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT n.*,u.name AS target_student_name
      FROM notifications n
      LEFT JOIN users u ON u.id=n.target_student_id
      ORDER BY n.created_at DESC,n.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Admin notifications error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      audience,
      campus,
      target_student_id,
      published
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        error: "Notification title and message are required"
      });
    }

    const validAudience = ["all", "campus", "student"];
    const safeAudience = validAudience.includes(audience)
      ? audience
      : "all";

    if (safeAudience === "campus" && !campus) {
      return res.status(400).json({ error: "Campus is required" });
    }

    if (safeAudience === "student" && !target_student_id) {
      return res.status(400).json({
        error: "Target student is required"
      });
    }

    const result = await pool.query(`
      INSERT INTO notifications(
        title,message,type,audience,campus,
        target_student_id,published
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      title,
      message,
      type || "Info",
      safeAudience,
      safeAudience === "campus" ? campus : null,
      safeAudience === "student" ? target_student_id : null,
      published !== false
    ]);

    audit("admin_notification_created", {
      notification_id: result.rows[0].id
    });

    res.json({
      success: true,
      notification: result.rows[0]
    });
  } catch (error) {
    console.error("Notification create error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/admin/notifications/:id", requireAdmin, async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      audience,
      campus,
      target_student_id,
      published
    } = req.body;

    const validAudience = ["all", "campus", "student"];
    const safeAudience = validAudience.includes(audience)
      ? audience
      : "all";

    const result = await pool.query(`
      UPDATE notifications
      SET
        title=$1,
        message=$2,
        type=$3,
        audience=$4,
        campus=$5,
        target_student_id=$6,
        published=$7
      WHERE id=$8
      RETURNING *
    `, [
      title,
      message,
      type || "Info",
      safeAudience,
      safeAudience === "campus" ? campus : null,
      safeAudience === "student" ? target_student_id : null,
      published !== false,
      req.params.id
    ]);

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    audit("admin_notification_updated", {
      notification_id: Number(req.params.id)
    });

    res.json({
      success: true,
      notification: result.rows[0]
    });
  } catch (error) {
    console.error("Notification update error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.delete("/api/admin/notifications/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM notification_reads
      WHERE notification_id=$1
    `, [req.params.id]);

    await pool.query(`
      DELETE FROM notifications
      WHERE id=$1
    `, [req.params.id]);

    audit("admin_notification_deleted", {
      notification_id: Number(req.params.id)
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Notification delete error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/public/notices", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,title,message,type,created_at
      FROM notifications
      WHERE published=TRUE
      AND audience='all'
      ORDER BY created_at DESC,id DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Public notices error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   DOCUMENTS / PDF
========================= */

app.post(
  "/api/documents",
  requireStudent,
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    let cloudResult = null;

    try {
      const title = String(req.body.title || "").trim();
      const description = String(req.body.description || "").trim();

      const allowedCategories = new Set([
        "Research Paper",
        "Publication",
        "Working Paper",
        "Conference Paper",
        "Report",
        "Other"
      ]);

      const category = allowedCategories.has(req.body.category)
        ? req.body.category
        : "Research Paper";

      if (!title) {
        return res.status(400).json({
          error: "Document title is required"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "PDF file is required"
        });
      }

      const countResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM documents
        WHERE student_id=$1
      `, [req.user.id]);

      if (countResult.rows[0].count >= 3) {
        return res.status(400).json({
          error: "You can upload a maximum of 3 PDF documents."
        });
      }

      cloudResult = await uploadPdfBuffer(req.file.buffer);

      const result = await pool.query(`
        INSERT INTO documents(
          student_id,title,category,description,
          file_url,file_public_id,original_name,
          mime_type,file_size
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [
        req.user.id,
        title,
        category,
        description || null,
        cloudResult.secure_url,
        cloudResult.public_id,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      ]);

      audit("document_uploaded", {
        user_id: req.user.id,
        document_id: result.rows[0].id
      });

      res.json({
        success: true,
        message: "PDF uploaded and submitted for admin review",
        document: result.rows[0]
      });
    } catch (error) {
      console.error("Document upload error:", error);

      if (cloudResult?.public_id) {
        try {
          await deleteCloudFile(cloudResult.public_id);
        } catch (deleteError) {
          console.error("Cloud rollback failed:", deleteError);
        }
      }

      res.status(500).json({
        error: "Document upload failed"
      });
    }
  }
);

app.get("/api/documents/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,title,category,description,file_url,
        original_name,file_size,status,created_at
      FROM documents
      WHERE student_id=$1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error("Student documents error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/admin/documents", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.*,
        u.name AS student_name,
        u.email AS student_email,
        u.department,
        u.campus
      FROM documents d
      JOIN users u ON u.id=d.student_id
      ORDER BY d.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Admin documents error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.patch("/api/admin/documents/:id", requireAdmin, async (req, res) => {
  try {
    if (!allowedStatuses.has(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const result = await pool.query(`
      UPDATE documents
      SET status=$1
      WHERE id=$2
      RETURNING id,status
    `, [req.body.status, req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Document not found"
      });
    }

    audit("admin_document_status_change", {
      document_id: Number(req.params.id),
      status: req.body.status
    });

    res.json({
      success: true,
      document: result.rows[0]
    });
  } catch (error) {
    console.error("Document status error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.delete("/api/admin/documents/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT file_public_id
      FROM documents
      WHERE id=$1
    `, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Document not found"
      });
    }

    await deleteCloudFile(result.rows[0].file_public_id);

    await pool.query(`
      DELETE FROM documents
      WHERE id=$1
    `, [req.params.id]);

    audit("admin_document_deleted", {
      document_id: Number(req.params.id)
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Document delete error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

/* =========================
   PUBLIC DATA
========================= */

app.get("/api/public/documents", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.id,d.title,d.category,d.description,
        d.file_url,d.original_name,d.file_size,d.created_at,
        u.name,u.department,u.campus
      FROM documents d
      JOIN users u ON u.id=d.student_id
      WHERE d.status='Approved'
      AND u.status='Approved'
      ORDER BY d.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Public documents error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/public/members", async (req, res) => {
  try {
    const campus = req.query.campus;

    if (campus) {
      const result = await pool.query(`
        SELECT
          id,name,department,campus,research_interest,bio
        FROM users
        WHERE role='student'
        AND status='Approved'
        AND campus=$1
        ORDER BY name ASC
      `, [campus]);

      return res.json(result.rows);
    }

    const result = await pool.query(`
      SELECT
        id,name,department,campus,research_interest,bio
      FROM users
      WHERE role='student'
      AND status='Approved'
      ORDER BY name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Public members error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/public/members/:id", async (req, res) => {
  try {
    const memberResult = await pool.query(`
      SELECT
        id,name,department,campus,research_interest,bio
      FROM users
      WHERE id=$1
      AND role='student'
      AND status='Approved'
    `, [req.params.id]);

    if (!memberResult.rows.length) {
      return res.status(404).json({
        error: "Member not found"
      });
    }

    const projectResult = await pool.query(`
      SELECT
        id,title,area,abstract,supervisor,created_at
      FROM projects
      WHERE student_id=$1
      AND status='Approved'
      ORDER BY id DESC
    `, [req.params.id]);

    const publicationResult = await pool.query(`
      SELECT
        id,title,journal,year,area,link,created_at
      FROM publications
      WHERE student_id=$1
      AND status='Approved'
      ORDER BY id DESC
    `, [req.params.id]);

    const documentResult = await pool.query(`
      SELECT
        id,title,category,description,file_url,
        original_name,file_size,created_at
      FROM documents
      WHERE student_id=$1
      AND status='Approved'
      ORDER BY id DESC
    `, [req.params.id]);

    res.json({
      member: memberResult.rows[0],
      projects: projectResult.rows,
      publications: publicationResult.rows,
      documents: documentResult.rows
    });
  } catch (error) {
    console.error("Member profile error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/public/projects", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        projects.title,
        projects.area,
        projects.abstract,
        projects.supervisor,
        users.name,
        users.department,
        users.campus
      FROM projects
      JOIN users ON projects.student_id=users.id
      WHERE projects.status='Approved'
      AND users.status='Approved'
      ORDER BY projects.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Public projects error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/public/publications", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        publications.title,
        publications.journal,
        publications.year,
        publications.area,
        publications.link,
        users.name,
        users.department,
        users.campus
      FROM publications
      JOIN users ON publications.student_id=users.id
      WHERE publications.status='Approved'
      AND users.status='Approved'
      ORDER BY publications.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Public publications error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "dcurs"
  });
});

/* =========================
   ERROR HANDLING
========================= */

app.use((error, req, res, next) => {
  console.error("Unhandled request error:", error);

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "PDF file must be 2 MB or smaller."
    });
  }

  if (
    error?.message === "Only PDF files are allowed." ||
    error?.message === "Invalid PDF file."
  ) {
    return res.status(400).json({
      error: "Please upload a valid PDF file."
    });
  }

  if (error?.message === "Origin not allowed") {
    return res.status(403).json({
      error: "Request origin is not allowed"
    });
  }

  res.status(500).json({
    error: "Something went wrong"
  });
});

app.listen(
  process.env.PORT || 3000,
  () => console.log("DCURS secure server running")
);
