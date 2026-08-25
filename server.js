const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const SECRET = process.env.SESSION_SECRET || "dcurs-secret";


app.use(express.json());

app.use(express.static("public"));



// ==========================
// POSTGRES CONNECTION
// ==========================


const pool = new Pool({

connectionString: process.env.DATABASE_URL,

ssl:{
rejectUnauthorized:false
}

});




// ==========================
// CREATE TABLES
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

student_id TEXT,

research_interest TEXT,

status TEXT DEFAULT 'Pending'

);

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



createTables();









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

student_id,

research_interest

}=req.body;



const hash = await bcrypt.hash(password,10);



await pool.query(`

INSERT INTO users

(name,email,password,department,student_id,research_interest)

VALUES($1,$2,$3,$4,$5,$6)

`,

[

name,

email,

hash,

department,

student_id,

research_interest

]

);



res.json({

success:true,

message:"Registration submitted"

});


}


catch(error){


res.status(400).json({

error:"Email already exists"

});


}


});









// ==========================
// STUDENT LOGIN
// ==========================


app.post("/api/login", async(req,res)=>{


const result = await pool.query(

"SELECT * FROM users WHERE email=$1",

[req.body.email]

);



const user=result.rows[0];



if(!user){

return res.status(401).json({

error:"Invalid login"

});

}



const match=await bcrypt.compare(

req.body.password,

user.password

);



if(!match){

return res.status(401).json({

error:"Invalid login"

});

}



if(user.status!=="Approved"){

return res.status(403).json({

error:"Account pending approval"

});

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

student_id:user.student_id,

research_interest:user.research_interest,

status:user.status

}

});


});

// ==========================
// ADMIN LOGIN
// ==========================


app.post("/api/admin/login",(req,res)=>{


const username = process.env.ADMIN_USERNAME;

const password = process.env.ADMIN_PASSWORD;



if(

req.body.username===username &&

req.body.password===password

){


const token = jwt.sign({

role:"admin"

},SECRET);



return res.json({

token

});


}



res.status(401).json({

error:"Invalid admin login"

});


});









// ==========================
// GET STUDENTS
// ==========================


app.get("/api/applications",async(req,res)=>{


const result = await pool.query(`

SELECT

id,

name,

email,

department,

student_id,

research_interest,

status

FROM users

WHERE role='student'

ORDER BY id DESC

`);



res.json(result.rows);


});









// ==========================
// APPROVE STUDENT
// ==========================


app.patch("/api/applications/:id",async(req,res)=>{


await pool.query(`

UPDATE users

SET status=$1

WHERE id=$2

`,

[

req.body.status,

req.params.id

]

);



res.json({

success:true

});


});









// ==========================
// PROFILE
// ==========================


app.get("/api/profile/:id",async(req,res)=>{


const result = await pool.query(`

SELECT

id,

name,

email,

department,

student_id,

research_interest,

status

FROM users

WHERE id=$1

`,

[req.params.id]

);



if(result.rows.length===0){

return res.status(404).json({

error:"Student not found"

});

}



res.json(result.rows[0]);


});









// ==========================
// CREATE PROJECT
// ==========================


app.post("/api/projects",async(req,res)=>{


const {

student_id,

title,

area,

abstract,

supervisor

}=req.body;



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

]

);



res.json({

success:true,

message:"Project submitted successfully"

});


});









// ==========================
// STUDENT PROJECTS
// ==========================


app.get("/api/projects/student/:id",async(req,res)=>{


const result = await pool.query(`

SELECT *

FROM projects

WHERE student_id=$1

ORDER BY id DESC

`,

[req.params.id]

);



res.json(result.rows);


});









// ==========================
// ADMIN PROJECTS
// ==========================


app.get("/api/projects",async(req,res)=>{


const result = await pool.query(`

SELECT *

FROM projects

ORDER BY id DESC

`);



res.json(result.rows);


});









// ==========================
// PROJECT STATUS
// ==========================


app.patch("/api/projects/:id",async(req,res)=>{


await pool.query(`

UPDATE projects

SET status=$1

WHERE id=$2

`,

[

req.body.status,

req.params.id

]

);



res.json({

success:true

});


});









// ==========================
// SUBMIT PUBLICATION
// ==========================


app.post("/api/publications",async(req,res)=>{


const {

student_id,

title,

journal,

year,

area,

link

}=req.body;



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

]

);



res.json({

success:true,

message:"Publication submitted successfully"

});


});









// ==========================
// STUDENT PUBLICATIONS
// ==========================


app.get("/api/publications/student/:id",async(req,res)=>{


const result = await pool.query(`

SELECT *

FROM publications

WHERE student_id=$1

ORDER BY id DESC

`,

[req.params.id]

);



res.json(result.rows);


});









// ==========================
// ADMIN PUBLICATIONS
// ==========================


app.get("/api/publications",async(req,res)=>{


const result = await pool.query(`

SELECT *

FROM publications

ORDER BY id DESC

`);



res.json(result.rows);


});









// ==========================
// PUBLICATION STATUS
// ==========================


app.patch("/api/publications/:id",async(req,res)=>{


await pool.query(`

UPDATE publications

SET status=$1

WHERE id=$2

`,

[

req.body.status,

req.params.id

]

);



res.json({

success:true

});


});









// ==========================
// PUBLIC RESEARCH ARCHIVE
// ==========================


app.get("/api/public/projects",async(req,res)=>{


const result = await pool.query(`

SELECT

projects.title,

projects.area,

projects.abstract,

projects.supervisor,

users.name,

users.department


FROM projects


JOIN users

ON projects.student_id = users.id



WHERE projects.status='Approved'

AND users.status='Approved'


ORDER BY projects.id DESC


`);



res.json(result.rows);


});









// ==========================
// PUBLIC PUBLICATION ARCHIVE
// ==========================


app.get("/api/public/publications",async(req,res)=>{


const result = await pool.query(`

SELECT


publications.title,

publications.journal,

publications.year,

publications.area,

publications.link,

users.name,

users.department


FROM publications


JOIN users

ON publications.student_id = users.id



WHERE publications.status='Approved'

AND users.status='Approved'


ORDER BY publications.id DESC


`);



res.json(result.rows);


});









// ==========================
// HEALTH CHECK
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
