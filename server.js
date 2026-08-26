const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const SECRET = process.env.SESSION_SECRET || "dcurs-secret";

app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(express.static("public"));

const pool = new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:{ rejectUnauthorized:false }
});

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

createTables().catch(err=>console.error("Database setup error:",err));


// ==========================
// REGISTER
// ==========================

app.post("/api/register",async(req,res)=>{
  try{
    const {
      name,email,password,department,campus,student_id,research_interest
    }=req.body;

    if(!name || !email || !password || !department){
      return res.status(400).json({
        error:"Name, email, password and department are required"
      });
    }

    const hash=await bcrypt.hash(password,10);

    await pool.query(`
      INSERT INTO users
      (name,email,password,department,campus,student_id,research_interest)
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `,[
      name,email,hash,department,campus||null,student_id||null,research_interest||null
    ]);

    res.json({
      success:true,
      message:"Registration submitted"
    });
  }
  catch(error){
    console.error("Register error:",error);

    if(error.code==="23505"){
      return res.status(400).json({error:"Email already exists"});
    }

    res.status(500).json({error:"Registration failed"});
  }
});


// ==========================
// LOGIN
// ==========================

app.post("/api/login",async(req,res)=>{
  try{
    const result=await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [req.body.email]
    );

    const user=result.rows[0];

    if(!user){
      return res.status(401).json({error:"Invalid login"});
    }

    const match=await bcrypt.compare(req.body.password,user.password);

    if(!match){
      return res.status(401).json({error:"Invalid login"});
    }

    if(user.status!=="Approved"){
      return res.status(403).json({error:"Account pending approval"});
    }

    const token=jwt.sign({
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
  const username=process.env.ADMIN_USERNAME;
  const password=process.env.ADMIN_PASSWORD;

  if(
    req.body.username===username &&
    req.body.password===password
  ){
    const token=jwt.sign({role:"admin"},SECRET);
    return res.json({token});
  }

  res.status(401).json({error:"Invalid admin login"});
});


// ==========================
// ADMIN STUDENTS
// ==========================

app.get("/api/applications",async(req,res)=>{
  try{
    const result=await pool.query(`
      SELECT
        id,name,email,department,campus,student_id,research_interest,status
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

app.patch("/api/applications/:id",async(req,res)=>{
  try{
    const allowed=["Pending","Approved","Rejected"];

    if(!allowed.includes(req.body.status)){
      return res.status(400).json({error:"Invalid status"});
    }

    await pool.query(`
      UPDATE users
      SET status=$1
      WHERE id=$2
    `,[req.body.status,req.params.id]);

    res.json({success:true});
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Student status update failed"});
  }
});


// ==========================
// PROFILE
// ==========================

app.get("/api/profile/:id",async(req,res)=>{
  try{
    const result=await pool.query(`
      SELECT
        id,name,email,department,campus,student_id,research_interest,status
      FROM users
      WHERE id=$1
    `,[req.params.id]);

    if(result.rows.length===0){
      return res.status(404).json({error:"Student not found"});
    }

    res.json(result.rows[0]);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load profile"});
  }
});


// ==========================
// PUBLIC MEMBERS
// ==========================

// Optional filter: /api/public/members?campus=Dhaka%20College
app.get("/api/public/members",async(req,res)=>{
  try{
    const campus=req.query.campus;

    if(campus){
      const result=await pool.query(`
        SELECT
          id,name,department,campus,research_interest
        FROM users
        WHERE role='student'
        AND status='Approved'
        AND campus=$1
        ORDER BY name ASC
      `,[campus]);

      return res.json(result.rows);
    }

    const result=await pool.query(`
      SELECT
        id,name,department,campus,research_interest
      FROM users
      WHERE role='student'
      AND status='Approved'
      ORDER BY name ASC
    `);

    res.json(result.rows);
  }
  catch(error){
    console.error("Public members error:",error);
    res.status(500).json({error:"Unable to load member directory"});
  }
});


// Member profile + approved projects/publications
app.get("/api/public/members/:id",async(req,res)=>{
  try{
    const memberResult=await pool.query(`
      SELECT
        id,name,department,campus,research_interest
      FROM users
      WHERE id=$1
      AND role='student'
      AND status='Approved'
    `,[req.params.id]);

    if(memberResult.rows.length===0){
      return res.status(404).json({error:"Member not found"});
    }

    const projectResult=await pool.query(`
      SELECT
        id,title,area,abstract,supervisor,created_at
      FROM projects
      WHERE student_id=$1
      AND status='Approved'
      ORDER BY id DESC
    `,[req.params.id]);

    const publicationResult=await pool.query(`
      SELECT
        id,title,journal,year,area,link,created_at
      FROM publications
      WHERE student_id=$1
      AND status='Approved'
      ORDER BY id DESC
    `,[req.params.id]);

    res.json({
      member:memberResult.rows[0],
      projects:projectResult.rows,
      publications:publicationResult.rows
    });
  }
  catch(error){
    console.error("Member profile error:",error);
    res.status(500).json({error:"Unable to load member profile"});
  }
});


// ==========================
// PROJECTS
// ==========================

app.post("/api/projects",async(req,res)=>{
  try{
    const {
      student_id,title,area,abstract,supervisor
    }=req.body;

    await pool.query(`
      INSERT INTO projects
      (student_id,title,area,abstract,supervisor)
      VALUES($1,$2,$3,$4,$5)
    `,[student_id,title,area,abstract,supervisor]);

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

app.get("/api/projects/student/:id",async(req,res)=>{
  try{
    const result=await pool.query(`
      SELECT *
      FROM projects
      WHERE student_id=$1
      ORDER BY id DESC
    `,[req.params.id]);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load projects"});
  }
});

app.get("/api/projects",async(req,res)=>{
  try{
    const result=await pool.query(`
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

app.patch("/api/projects/:id",async(req,res)=>{
  try{
    await pool.query(`
      UPDATE projects
      SET status=$1
      WHERE id=$2
    `,[req.body.status,req.params.id]);

    res.json({success:true});
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Project status update failed"});
  }
});


// ==========================
// PUBLICATIONS
// ==========================

app.post("/api/publications",async(req,res)=>{
  try{
    const {
      student_id,title,journal,year,area,link
    }=req.body;

    await pool.query(`
      INSERT INTO publications
      (student_id,title,journal,year,area,link)
      VALUES($1,$2,$3,$4,$5,$6)
    `,[student_id,title,journal,year,area,link]);

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

app.get("/api/publications/student/:id",async(req,res)=>{
  try{
    const result=await pool.query(`
      SELECT *
      FROM publications
      WHERE student_id=$1
      ORDER BY id DESC
    `,[req.params.id]);

    res.json(result.rows);
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Unable to load publications"});
  }
});

app.get("/api/publications",async(req,res)=>{
  try{
    const result=await pool.query(`
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

app.patch("/api/publications/:id",async(req,res)=>{
  try{
    await pool.query(`
      UPDATE publications
      SET status=$1
      WHERE id=$2
    `,[req.body.status,req.params.id]);

    res.json({success:true});
  }
  catch(error){
    console.error(error);
    res.status(500).json({error:"Publication status update failed"});
  }
});


// ==========================
// PUBLIC ARCHIVES
// ==========================

app.get("/api/public/projects",async(req,res)=>{
  try{
    const result=await pool.query(`
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
      ON projects.student_id=users.id
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

app.get("/api/public/publications",async(req,res)=>{
  try{
    const result=await pool.query(`
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
      ON publications.student_id=users.id
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

app.get("/health",(req,res)=>{
  res.json({
    ok:true,
    service:"dcurs"
  });
});

app.listen(
  process.env.PORT || 3000,
  ()=>console.log("DCURS PostgreSQL server running")
);
