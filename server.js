const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();

const db = new Database("dcurs.sqlite");

const SECRET = process.env.SESSION_SECRET || "dcurs-secret";


app.use(express.json());

app.use(express.static("public"));




// ==========================
// DATABASE TABLES
// ==========================


db.exec(`

CREATE TABLE IF NOT EXISTS users(

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT NOT NULL,

email TEXT UNIQUE NOT NULL,

password TEXT NOT NULL,

role TEXT DEFAULT 'student',

department TEXT,

student_id TEXT,

research_interest TEXT,

status TEXT DEFAULT 'Pending'

)

`);






db.exec(`

CREATE TABLE IF NOT EXISTS projects(

id INTEGER PRIMARY KEY AUTOINCREMENT,

student_id INTEGER,

title TEXT,

area TEXT,

abstract TEXT,

supervisor TEXT,

status TEXT DEFAULT 'Pending',

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

)

`);







// ==========================
// PUBLICATIONS TABLE
// ==========================


db.exec(`

CREATE TABLE IF NOT EXISTS publications(

id INTEGER PRIMARY KEY AUTOINCREMENT,

student_id INTEGER,

title TEXT,

journal TEXT,

year TEXT,

area TEXT,

link TEXT,

status TEXT DEFAULT 'Pending',

created_at DATETIME DEFAULT CURRENT_TIMESTAMP

)

`);









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



db.prepare(`

INSERT INTO users

(

name,

email,

password,

department,

student_id,

research_interest

)

VALUES(?,?,?,?,?,?)

`).run(

name,

email,

hash,

department,

student_id,

research_interest

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


const user = db.prepare(

"SELECT * FROM users WHERE email=?"

).get(req.body.email);




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
// ADMIN GET STUDENT APPLICATIONS
// ==========================


app.get("/api/applications",(req,res)=>{


const students = db.prepare(`

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

`).all();



res.json(students);


});









// ==========================
// APPROVE / REJECT STUDENT
// ==========================


app.patch("/api/applications/:id",(req,res)=>{


db.prepare(`

UPDATE users

SET status=?

WHERE id=?

`).run(

req.body.status,

req.params.id

);



res.json({

success:true

});


});









// ==========================
// STUDENT PROFILE
// ==========================


app.get("/api/profile/:id",(req,res)=>{


const student = db.prepare(`

SELECT

id,

name,

email,

department,

student_id,

research_interest,

status

FROM users

WHERE id=?

`).get(req.params.id);



if(!student){

return res.status(404).json({

error:"Student not found"

});

}



res.json(student);


});









// ==========================
// SUBMIT RESEARCH PROJECT
// ==========================


app.post("/api/projects",(req,res)=>{


const {

student_id,

title,

area,

abstract,

supervisor

}=req.body;



db.prepare(`

INSERT INTO projects

(

student_id,

title,

area,

abstract,

supervisor

)

VALUES(?,?,?,?,?)

`).run(

student_id,

title,

area,

abstract,

supervisor

);



res.json({

success:true,

message:"Project submitted successfully"

});


});









// ==========================
// STUDENT PROJECT LIST
// ==========================


app.get("/api/projects/student/:id",(req,res)=>{


const projects = db.prepare(`

SELECT *

FROM projects

WHERE student_id=?

ORDER BY id DESC

`).all(req.params.id);



res.json(projects);


});









// ==========================
// ADMIN PROJECT LIST
// ==========================


app.get("/api/projects",(req,res)=>{


const projects = db.prepare(`

SELECT *

FROM projects

ORDER BY id DESC

`).all();



res.json(projects);


});









// ==========================
// PROJECT APPROVE / REJECT
// ==========================


app.patch("/api/projects/:id",(req,res)=>{


db.prepare(`

UPDATE projects

SET status=?

WHERE id=?

`).run(

req.body.status,

req.params.id

);



res.json({

success:true

});


});









// ==========================
// SUBMIT PUBLICATION
// ==========================


app.post("/api/publications",(req,res)=>{


const {

student_id,

title,

journal,

year,

area,

link

}=req.body;



db.prepare(`

INSERT INTO publications

(

student_id,

title,

journal,

year,

area,

link

)

VALUES(?,?,?,?,?,?)

`).run(

student_id,

title,

journal,

year,

area,

link

);



res.json({

success:true,

message:"Publication submitted successfully"

});


});









// ==========================
// STUDENT PUBLICATIONS
// ==========================


app.get("/api/publications/student/:id",(req,res)=>{


const publications = db.prepare(`

SELECT *

FROM publications

WHERE student_id=?

ORDER BY id DESC

`).all(req.params.id);



res.json(publications);


});









// ==========================
// ADMIN PUBLICATIONS
// ==========================


app.get("/api/publications",(req,res)=>{


const publications = db.prepare(`

SELECT *

FROM publications

ORDER BY id DESC

`).all();



res.json(publications);


});









// ==========================
// PUBLICATION APPROVE / REJECT
// ==========================


app.patch("/api/publications/:id",(req,res)=>{


db.prepare(`

UPDATE publications

SET status=?

WHERE id=?

`).run(

req.body.status,

req.params.id

);



res.json({

success:true

});


});









// ==========================
// PUBLIC APPROVED PUBLICATIONS
// ==========================


app.get("/api/public/publications",(req,res)=>{


try{


const publications = db.prepare(`

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


`).all();



res.json(publications);


}


catch(error){


res.status(500).json({

error:"Failed to load publications"

});


}


});









// ==========================
// PUBLIC APPROVED PROJECTS
// ==========================


app.get("/api/public/projects",(req,res)=>{


const projects = db.prepare(`

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


`).all();



res.json(projects);


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


console.log("DCURS server running");


}

);
