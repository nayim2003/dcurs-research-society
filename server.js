const express=require("express");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const Database=require("better-sqlite3");
const path=require("path");
const app=express();
const db=new Database("dcurs.sqlite");
const SECRET=process.env.SESSION_SECRET||"change-secret";
db.exec(`CREATE TABLE IF NOT EXISTS users(
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,email TEXT UNIQUE,password TEXT,role TEXT DEFAULT 'student',
department TEXT,student_id TEXT,research_interest TEXT,status TEXT DEFAULT 'Pending')`);
app.use(express.json());
app.use(express.static("public"));
app.post("/api/register",async(req,res)=>{
 const {name,email,password,department,student_id,research_interest}=req.body;
 const hash=await bcrypt.hash(password,10);
 try{db.prepare("INSERT INTO users(name,email,password,department,student_id,research_interest) VALUES(?,?,?,?,?,?)").run(name,email,hash,department,student_id,research_interest);
 res.json({message:"Registration submitted. Wait for approval."})}
 catch(e){res.status(400).json({error:"Email already exists"})}
});
app.post("/api/login",async(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(req.body.email);
 if(!u||!(await bcrypt.compare(req.body.password,u.password)))return res.status(401).json({error:"Invalid login"});
 if(u.status!=="Approved"&&u.role==="student")return res.status(403).json({error:"Account pending approval"});
 res.json({token:jwt.sign({id:u.id,role:u.role},SECRET)});
});
app.get("/api/me",(req,res)=>res.json({message:"Student dashboard API ready"}));
app.listen(process.env.PORT||3000);
