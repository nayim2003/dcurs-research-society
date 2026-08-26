const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const SECRET = process.env.SESSION_SECRET || "dcurs-secret";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));


// ==========================
// POSTGRES CONNECTION
// ==========================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


// ==========================
// DATABASE SETUP / MIGRATION
// ==========================

async function createTables(){

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
      status TEXT DEFAULT 'Pending'
    );
  `);

  // Safe migration for existing PostgreSQL databases.
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS campus TEXT;
  `);

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

  console.log("Database ready");
}

createTables().catch(error => {
  console.error("Database setup error:", error);
});


// ==========================
// STUDENT REGISTER
// ==========================

app.post("/api/register", async(req,res)=>{

  try{

    const {
      name,
      email,
      password,
      department,
      campus,
      student_id,
      research_interest
    } = req.body;

    if(!name || !email || !password || !department){
      return res.status(400).json({
        error:"Name, email, password and department are required"
      });
    }

    const hash = await bcrypt.hash(password,10);

    await pool.query(`
      INSERT INTO users
      (name,email,password,department,campus,student_id,research_interest)
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      name,
      email,
      hash,
      department,
      campus || null,
      student_id || null,
      research_interest || null
    ]);

    res.json({
      success:true,
      message:"Registration submitted"
    });

  }
  catch(error){

    console.error("Register error:", error);

    if(error.code === "23505"){
      return res.status(400).json({
        error:"Email already exists"
      });
    }

    res.status(500).json({
      error:"Registration failed"
    });
  }
});


// ==========================
// STUDENT LOGIN
// ==========================

app.post("/api/login", async(req,res)=>{

  try{

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [req.body.email]
    );

    const user = result.rows[0];

    if(!user){
      return res.status(401).json({
        error:"Invalid login"
      });
    }

    const match = await bcrypt.compare(
      req.body.password,
      user.password
    );

    if(!match){
      return res.status(401).json({
        error:"Invalid login"
      });
    }

    if(user.status !== "Approved"){
      return res.status(403).json({
        error:"Account pending approval"
      });
    }

    const token = jwt.sign({
      id:user.id,
      role:user.role
    },SECRET);

    res.json({
      token,
      user:{
        id:user.id,
        name:user.name,
        email:user.email,
        department:user.department,
        campus:user.campus,
        student_id:user.student_id,
        research_interest:user.research_interest,
        status:user.status
      }
    });

  }
  catch(error){
    console.error("Login error:",error);
    res.status(500).json({error:"Login failed"});
  }
});


// ==========================
// ADMIN LOGIN
// ==========================

app.post("/api/admin/login",(req,res)=>{

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if(
    req.body.username === username &&
    req.body.password === password
  ){
    const token = jwt.sign({
      role:"admin"
    },SECRET);

    return res.json({token});
  }

  res.status(401).json({
    error:"Invalid admin login"
  });
});


// ==========================
// ADMIN GET STUDENTS
// ==========================

app.get("/api/applications", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT
        id,
        name,
        email,
        department,
        campus,
        student_id,
        research_interest,
        status
      FROM users
      WHERE role='student'
      ORDER BY id DESC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load students"});
  }
});


// ==========================
// ADMIN APPROVE / REJECT STUDENT
// ==========================

app.patch("/api/applications/:id", async(req,res)=>{

  try{
    const allowed = ["Pending","Approved","Rejected"];

    if(!allowed.includes(req.body.status)){
      return res.status(400).json({error:"Invalid status"});
    }

    await pool.query(`
      UPDATE users
      SET status=$1
      WHERE id=$2
    `,
    [
      req.body.status,
      req.params.id
    ]);

    res.json({success:true});
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Student status update failed"});
  }
});


// ==========================
// STUDENT PROFILE
// ==========================

app.get("/api/profile/:id", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT
        id,
        name,
        email,
        department,
        campus,
        student_id,
        research_interest,
        status
      FROM users
      WHERE id=$1
    `,
    [req.params.id]);

    if(result.rows.length === 0){
      return res.status(404).json({
        error:"Student not found"
      });
    }

    res.json(result.rows[0]);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load profile"});
  }
});


// ==========================
// PUBLIC MEMBER DIRECTORY
// ==========================

app.get("/api/public/members", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT
        id,
        name,
        department,
        campus,
        research_interest
      FROM users
      WHERE role='student'
      AND status='Approved'
      ORDER BY name ASC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error("Public members error:",error);
    res.status(500).json({
      error:"Unable to load member directory"
    });
  }
});


// ==========================
// CREATE PROJECT
// ==========================

app.post("/api/projects", async(req,res)=>{

  try{
    const {
      student_id,
      title,
      area,
      abstract,
      supervisor
    } = req.body;

    await pool.query(`
      INSERT INTO projects
      (student_id,title,area,abstract,supervisor)
      VALUES($1,$2,$3,$4,$5)
    `,
    [
      student_id,
      title,
      area,
      abstract,
      supervisor
    ]);

    res.json({
      success:true,
      message:"Project submitted successfully"
    });
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Project submission failed"});
  }
});


// ==========================
// STUDENT PROJECTS
// ==========================

app.get("/api/projects/student/:id", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT *
      FROM projects
      WHERE student_id=$1
      ORDER BY id DESC
    `,
    [req.params.id]);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load projects"});
  }
});


// ==========================
// ADMIN PROJECTS
// ==========================

app.get("/api/projects", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT *
      FROM projects
      ORDER BY id DESC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load projects"});
  }
});


// ==========================
// PROJECT STATUS
// ==========================

app.patch("/api/projects/:id", async(req,res)=>{

  try{
    await pool.query(`
      UPDATE projects
      SET status=$1
      WHERE id=$2
    `,
    [
      req.body.status,
      req.params.id
    ]);

    res.json({success:true});
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Project status update failed"});
  }
});


// ==========================
// SUBMIT PUBLICATION
// ==========================

app.post("/api/publications", async(req,res)=>{

  try{
    const {
      student_id,
      title,
      journal,
      year,
      area,
      link
    } = req.body;

    await pool.query(`
      INSERT INTO publications
      (student_id,title,journal,year,area,link)
      VALUES($1,$2,$3,$4,$5,$6)
    `,
    [
      student_id,
      title,
      journal,
      year,
      area,
      link
    ]);

    res.json({
      success:true,
      message:"Publication submitted successfully"
    });
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Publication submission failed"});
  }
});


// ==========================
// STUDENT PUBLICATIONS
// ==========================

app.get("/api/publications/student/:id", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT *
      FROM publications
      WHERE student_id=$1
      ORDER BY id DESC
    `,
    [req.params.id]);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load publications"});
  }
});


// ==========================
// ADMIN PUBLICATIONS
// ==========================

app.get("/api/publications", async(req,res)=>{

  try{
    const result = await pool.query(`
      SELECT *
      FROM publications
      ORDER BY id DESC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load publications"});
  }
});


// ==========================
// PUBLICATION STATUS
// ==========================

app.patch("/api/publications/:id", async(req,res)=>{

  try{
    await pool.query(`
      UPDATE publications
      SET status=$1
      WHERE id=$2
    `,
    [
      req.body.status,
      req.params.id
    ]);

    res.json({success:true});
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Publication status update failed"});
  }
});


// ==========================
// PUBLIC RESEARCH ARCHIVE
// ==========================

app.get("/api/public/projects", async(req,res)=>{

  try{
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
      JOIN users
      ON projects.student_id = users.id
      WHERE projects.status='Approved'
      AND users.status='Approved'
      ORDER BY projects.id DESC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load research archive"});
  }
});


// ==========================
// PUBLIC PUBLICATION ARCHIVE
// ==========================

app.get("/api/public/publications", async(req,res)=>{

  try{
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
      JOIN users
      ON publications.student_id = users.id
      WHERE publications.status='Approved'
      AND users.status='Approved'
      ORDER BY publications.id DESC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load publication archive"});
  }
});


// ==========================
// HEALTH
// ==========================

app.get("/health",(req,res)=>{
  res.json({
    ok:true,
    service:"dcurs"
  });
});


// ==========================
// START SERVER
// ==========================

app.listen(
  process.env.PORT || 3000,
  ()=>{
    console.log("DCURS PostgreSQL server running");
  }
);
