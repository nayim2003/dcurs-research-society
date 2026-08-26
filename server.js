const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const {
  upload,
  uploadPdfBuffer,
  deleteCloudFile
} = require("./storage");

const app = express();
const SECRET = process.env.SESSION_SECRET || "dcurs-secret";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
      student_id INTEGER,
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
      student_id INTEGER,
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
  console.error("Database setup error:", error);
});

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function requireStudent(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Student login required" });

    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== "student") {
      return res.status(403).json({ error: "Student access only" });
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Admin login required" });

    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Admin access only" });
    }

    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

/* =========================
   AUTH
========================= */

app.post("/api/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      department,
      campus,
      student_id,
      research_interest
    } = req.body;

    if (!name || !email || !password || !department) {
      return res.status(400).json({
        error: "Name, email, password and department are required"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(`
      INSERT INTO users
      (name,email,password,department,campus,student_id,research_interest)
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `, [
      name,
      email,
      hash,
      department,
      campus || null,
      student_id || null,
      research_interest || null
    ]);

    res.json({ success: true, message: "Registration submitted" });
  } catch (error) {
    console.error("Register error:", error);

    if (error.code === "23505") {
      return res.status(400).json({ error: "Email already exists" });
    }

    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [req.body.email]
    );

    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: "Invalid login" });

    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid login" });

    if (user.status !== "Approved") {
      return res.status(403).json({ error: "Account pending approval" });
    }

    const token = jwt.sign(
      { id: user.id, role: "student" },
      SECRET,
      { expiresIn: "7d" }
    );

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
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/admin/login", (req, res) => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (req.body.username === username && req.body.password === password) {
    const token = jwt.sign(
      { role: "admin" },
      SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ token });
  }

  res.status(401).json({ error: "Invalid admin login" });
});

/* =========================
   ADMIN STUDENTS
========================= */

app.get("/api/applications", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,name,email,department,campus,student_id,research_interest,bio,status
      FROM users
      WHERE role='student'
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load students" });
  }
});

app.patch("/api/applications/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["Pending", "Approved", "Rejected"];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await pool.query(`
      UPDATE users SET status=$1 WHERE id=$2
    `, [req.body.status, req.params.id]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Student status update failed" });
  }
});

/* =========================
   STUDENT PROFILE
========================= */

app.get("/api/profile", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,name,email,department,campus,student_id,research_interest,bio,status
      FROM users
      WHERE id=$1
    `, [req.user.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load profile" });
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
        id,name,email,department,campus,student_id,research_interest,bio,status
    `, [
      name,
      department,
      campus || null,
      student_id || null,
      research_interest || null,
      bio || null,
      req.user.id
    ]);

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Profile update failed" });
  }
});

/* =========================
   PROJECTS
========================= */

app.post("/api/projects", requireStudent, async (req, res) => {
  try {
    const { title, area, abstract, supervisor } = req.body;

    await pool.query(`
      INSERT INTO projects
      (student_id,title,area,abstract,supervisor)
      VALUES($1,$2,$3,$4,$5)
    `, [req.user.id, title, area, abstract, supervisor]);

    res.json({ success: true, message: "Project submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Project submission failed" });
  }
});

app.get("/api/projects/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM projects
      WHERE student_id=$1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load projects" });
  }
});

app.get("/api/projects", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM projects ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load projects" });
  }
});

app.patch("/api/projects/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      UPDATE projects SET status=$1 WHERE id=$2
    `, [req.body.status, req.params.id]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Project status update failed" });
  }
});

/* =========================
   PUBLICATIONS
========================= */

app.post("/api/publications", requireStudent, async (req, res) => {
  try {
    const { title, journal, year, area, link } = req.body;

    await pool.query(`
      INSERT INTO publications
      (student_id,title,journal,year,area,link)
      VALUES($1,$2,$3,$4,$5,$6)
    `, [req.user.id, title, journal, year, area, link]);

    res.json({ success: true, message: "Publication submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Publication submission failed" });
  }
});

app.get("/api/publications/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM publications
      WHERE student_id=$1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load publications" });
  }
});

app.get("/api/publications", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM publications ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load publications" });
  }
});

app.patch("/api/publications/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`
      UPDATE publications SET status=$1 WHERE id=$2
    `, [req.body.status, req.params.id]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Publication status update failed" });
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
      ORDER BY e.event_date ASC, e.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load events" });
  }
});

app.get("/api/events/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        EXISTS(
          SELECT 1 FROM event_registrations r
          WHERE r.event_id=e.id AND r.student_id=$1
        ) AS registered,
        (
          SELECT COUNT(*)::int
          FROM event_registrations r2
          WHERE r2.event_id=e.id
        ) AS registered_count
      FROM events e
      WHERE e.status='Published'
      ORDER BY e.event_date ASC, e.id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load events" });
  }
});

app.post("/api/events/:id/register", requireStudent, async (req, res) => {
  try {
    const eventResult = await pool.query(`
      SELECT * FROM events
      WHERE id=$1 AND status='Published'
    `, [req.params.id]);

    if (!eventResult.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventResult.rows[0];

    if (event.registration_deadline) {
      const deadline = new Date(event.registration_deadline);
      deadline.setHours(23, 59, 59, 999);

      if (new Date() > deadline) {
        return res.status(400).json({ error: "Registration deadline has passed" });
      }
    }

    if (event.capacity) {
      const countResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM event_registrations
        WHERE event_id=$1
      `, [req.params.id]);

      if (countResult.rows[0].count >= event.capacity) {
        return res.status(400).json({ error: "Event capacity is full" });
      }
    }

    await pool.query(`
      INSERT INTO event_registrations(event_id,student_id)
      VALUES($1,$2)
      ON CONFLICT(event_id,student_id) DO NOTHING
    `, [req.params.id, req.user.id]);

    res.json({ success: true, message: "Event registration successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Event registration failed" });
  }
});

app.delete("/api/events/:id/register", requireStudent, async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM event_registrations
      WHERE event_id=$1 AND student_id=$2
    `, [req.params.id, req.user.id]);

    res.json({ success: true, message: "Registration cancelled" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to cancel registration" });
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
      ORDER BY e.event_date DESC, e.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load admin events" });
  }
});

app.post("/api/admin/events", requireAdmin, async (req, res) => {
  try {
    const {
      title,description,event_date,event_time,venue,campus,
      registration_deadline,capacity,status
    } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: "Event title and date are required" });
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
      status || "Published"
    ]);

    res.json({ success: true, event: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to create event" });
  }
});

app.patch("/api/admin/events/:id", requireAdmin, async (req, res) => {
  try {
    const {
      title,description,event_date,event_time,venue,campus,
      registration_deadline,capacity,status
    } = req.body;

    const result = await pool.query(`
      UPDATE events
      SET
        title=$1,description=$2,event_date=$3,event_time=$4,venue=$5,
        campus=$6,registration_deadline=$7,capacity=$8,status=$9
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
      status || "Published",
      req.params.id
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ success: true, event: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to update event" });
  }
});

app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM event_registrations WHERE event_id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM events WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to delete event" });
  }
});

app.get("/api/admin/events/:id/attendees", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,u.name,u.email,u.department,u.campus,u.student_id,r.registered_at
      FROM event_registrations r
      JOIN users u ON u.id=r.student_id
      WHERE r.event_id=$1
      ORDER BY r.registered_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load attendees" });
  }
});

/* =========================
   NOTIFICATIONS
========================= */

app.get("/api/notifications/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        n.id,n.title,n.message,n.type,n.audience,n.campus,n.created_at,
        (nr.id IS NOT NULL) AS is_read
      FROM notifications n
      JOIN users u ON u.id=$1
      LEFT JOIN notification_reads nr
        ON nr.notification_id=n.id AND nr.student_id=$1
      WHERE n.published=TRUE
      AND (
        n.audience='all'
        OR (n.audience='campus' AND n.campus=u.campus)
        OR (n.audience='student' AND n.target_student_id=u.id)
      )
      ORDER BY n.created_at DESC, n.id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load notifications" });
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
    console.error(error);
    res.status(500).json({ error: "Unable to mark notification as read" });
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
    console.error(error);
    res.status(500).json({ error: "Unable to mark notifications as read" });
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
    console.error(error);
    res.status(500).json({ error: "Unable to load notifications" });
  }
});

app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
  try {
    const {
      title,message,type,audience,campus,target_student_id,published
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        error: "Notification title and message are required"
      });
    }

    const allowed = ["all", "campus", "student"];
    if (!allowed.includes(audience || "all")) {
      return res.status(400).json({ error: "Invalid audience" });
    }

    if (audience === "campus" && !campus) {
      return res.status(400).json({ error: "Campus is required" });
    }

    if (audience === "student" && !target_student_id) {
      return res.status(400).json({ error: "Target student is required" });
    }

    const result = await pool.query(`
      INSERT INTO notifications(
        title,message,type,audience,campus,target_student_id,published
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      title,
      message,
      type || "Info",
      audience || "all",
      audience === "campus" ? campus : null,
      audience === "student" ? target_student_id : null,
      published !== false
    ]);

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to create notification" });
  }
});

app.patch("/api/admin/notifications/:id", requireAdmin, async (req, res) => {
  try {
    const {
      title,message,type,audience,campus,target_student_id,published
    } = req.body;

    const result = await pool.query(`
      UPDATE notifications
      SET
        title=$1,message=$2,type=$3,audience=$4,campus=$5,
        target_student_id=$6,published=$7
      WHERE id=$8
      RETURNING *
    `, [
      title,
      message,
      type || "Info",
      audience || "all",
      audience === "campus" ? campus : null,
      audience === "student" ? target_student_id : null,
      published !== false,
      req.params.id
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to update notification" });
  }
});

app.delete("/api/admin/notifications/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM notification_reads WHERE notification_id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM notifications WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to delete notification" });
  }
});

app.get("/api/public/notices", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id,title,message,type,created_at
      FROM notifications
      WHERE published=TRUE AND audience='all'
      ORDER BY created_at DESC,id DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load public notices" });
  }
});

/* =========================
   PDF DOCUMENTS
========================= */

app.post(
  "/api/documents",
  requireStudent,
  upload.single("file"),
  async (req, res) => {
    let cloudResult = null;

    try {
      const { title, category, description } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Document title is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      // Free-plan protection:
      // maximum 3 uploaded documents per student.
      const documentCountResult = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM documents
        WHERE student_id=$1
      `, [req.user.id]);

      if (documentCountResult.rows[0].count >= 3) {
        return res.status(400).json({
          error: "You can upload a maximum of 3 PDF documents."
        });
      }

      cloudResult = await uploadPdfBuffer(req.file.buffer);

      const result = await pool.query(`
        INSERT INTO documents(
          student_id,title,category,description,file_url,file_public_id,
          original_name,mime_type,file_size
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [
        req.user.id,
        title,
        category || "Research Paper",
        description || null,
        cloudResult.secure_url,
        cloudResult.public_id,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      ]);

      res.json({
        success: true,
        message: "PDF uploaded and submitted for admin review",
        document: result.rows[0]
      });
    } catch (error) {
      console.error("Document upload error:", error);

      if (cloudResult && cloudResult.public_id) {
        try {
          await deleteCloudFile(cloudResult.public_id);
        } catch {}
      }

      res.status(500).json({
        error: error.message || "Document upload failed"
      });
    }
  }
);

app.get("/api/documents/student", requireStudent, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,title,category,description,file_url,original_name,file_size,status,created_at
      FROM documents
      WHERE student_id=$1
      ORDER BY id DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load documents" });
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
    console.error(error);
    res.status(500).json({ error: "Unable to load documents" });
  }
});

app.patch("/api/admin/documents/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["Pending", "Approved", "Rejected"];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const result = await pool.query(`
      UPDATE documents
      SET status=$1
      WHERE id=$2
      RETURNING *
    `, [req.body.status, req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({ success: true, document: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Document status update failed" });
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
      return res.status(404).json({ error: "Document not found" });
    }

    await deleteCloudFile(result.rows[0].file_public_id);

    await pool.query(`
      DELETE FROM documents
      WHERE id=$1
    `, [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to delete document" });
  }
});

app.get("/api/public/documents", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.id,d.title,d.category,d.description,d.file_url,
        d.original_name,d.file_size,d.created_at,
        u.name,u.department,u.campus
      FROM documents d
      JOIN users u ON u.id=d.student_id
      WHERE d.status='Approved'
      AND u.status='Approved'
      ORDER BY d.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load public documents" });
  }
});

/* =========================
   PUBLIC MEMBERS / ARCHIVES
========================= */

app.get("/api/public/members", async (req, res) => {
  try {
    const campus = req.query.campus;

    if (campus) {
      const result = await pool.query(`
        SELECT id,name,department,campus,research_interest,bio
        FROM users
        WHERE role='student'
        AND status='Approved'
        AND campus=$1
        ORDER BY name ASC
      `, [campus]);

      return res.json(result.rows);
    }

    const result = await pool.query(`
      SELECT id,name,department,campus,research_interest,bio
      FROM users
      WHERE role='student'
      AND status='Approved'
      ORDER BY name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load member directory" });
  }
});

app.get("/api/public/members/:id", async (req, res) => {
  try {
    const memberResult = await pool.query(`
      SELECT id,name,department,campus,research_interest,bio
      FROM users
      WHERE id=$1
      AND role='student'
      AND status='Approved'
    `, [req.params.id]);

    if (!memberResult.rows.length) {
      return res.status(404).json({ error: "Member not found" });
    }

    const projectResult = await pool.query(`
      SELECT id,title,area,abstract,supervisor,created_at
      FROM projects
      WHERE student_id=$1 AND status='Approved'
      ORDER BY id DESC
    `, [req.params.id]);

    const publicationResult = await pool.query(`
      SELECT id,title,journal,year,area,link,created_at
      FROM publications
      WHERE student_id=$1 AND status='Approved'
      ORDER BY id DESC
    `, [req.params.id]);

    const documentResult = await pool.query(`
      SELECT id,title,category,description,file_url,original_name,file_size,created_at
      FROM documents
      WHERE student_id=$1 AND status='Approved'
      ORDER BY id DESC
    `, [req.params.id]);

    res.json({
      member: memberResult.rows[0],
      projects: projectResult.rows,
      publications: publicationResult.rows,
      documents: documentResult.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load member profile" });
  }
});

app.get("/api/public/projects", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        projects.title,projects.area,projects.abstract,projects.supervisor,
        users.name,users.department,users.campus
      FROM projects
      JOIN users ON projects.student_id=users.id
      WHERE projects.status='Approved'
      AND users.status='Approved'
      ORDER BY projects.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load research archive" });
  }
});

app.get("/api/public/publications", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        publications.title,publications.journal,publications.year,
        publications.area,publications.link,
        users.name,users.department,users.campus
      FROM publications
      JOIN users ON publications.student_id=users.id
      WHERE publications.status='Approved'
      AND users.status='Approved'
      ORDER BY publications.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load publication archive" });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dcurs" });
});

app.use((error, req, res, next) => {
  console.error("Unhandled request error:", error);

  if (error && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "PDF file must be 2 MB or smaller."
    });
  }

  if (error && error.message === "Only PDF files are allowed.") {
    return res.status(400).json({
      error: "Only PDF files are allowed."
    });
  }

  res.status(500).json({
    error: "Server error"
  });
});

app.listen(
  process.env.PORT || 3000,
  () => console.log("DCURS secure PostgreSQL server running")
);
