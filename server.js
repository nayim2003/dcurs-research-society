const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();

const db = new Database("dcurs.sqlite");

const SECRET = process.env.SESSION_SECRET || "dcurs-secret";


app.use(express.json());

app.use(express.static("public"));



// DATABASE

db.exec(`

CREATE TABLE IF NOT EXISTS users (

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT,

email TEXT UNIQUE,

password TEXT,

role TEXT DEFAULT 'student',

department TEXT,

student_id TEXT,

research_interest TEXT,

status TEXT DEFAULT 'Pending'

)

`);





// STUDENT REGISTRATION


app.post("/api/register", async(req,res)=>{


const {

name,

email,

password,

department,

student_id,

research_interest


}=req.body;



try{


const hash = await bcrypt.hash(password,10);



db.prepare(`

INSERT INTO users

(name,email,password,department,student_id,research_interest)

VALUES (?,?,?,?,?,?)

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

message:"Registration submitted. Wait for admin approval."

});


}

catch(error){


res.status(400).json({

error:"Email already exists"

});


}


});







// STUDENT LOGIN


app.post("/api/login",async(req,res)=>{


const user = db.prepare(

"SELECT * FROM users WHERE email=?"

).get(req.body.email);



if(!user)

return res.status(401).json({

error:"Invalid login"

});



const match = await bcrypt.compare(

req.body.password,

user.password

);



if(!match)

return res.status(401).json({

error:"Invalid login"

});




if(user.status !== "Approved")

return res.status(403).json({

error:"Account pending approval"

});




const token = jwt.sign({

id:user.id,

role:user.role

},SECRET);



res.json({

token,

user:{

name:user.name,

email:user.email

}

});


});








// ADMIN LOGIN


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



return res.json({

token

});


}



res.status(401).json({

error:"Invalid admin login"

});


});









// ADMIN GET STUDENTS


app.get("/api/applications",(req,res)=>{


const data = db.prepare(`

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



res.json(data);


});







// ADMIN APPROVE / REJECT


app.patch("/api/applications/:id",(req,res)=>{


const {status}=req.body;



if(

!["Approved","Rejected","Pending"]

.includes(status)

)

return res.status(400).json({

error:"Invalid status"

});




db.prepare(`

UPDATE users

SET status=?

WHERE id=?

`).run(

status,

req.params.id

);



res.json({

success:true

});


});








// STUDENT PROFILE


app.get("/api/profile/:id",(req,res)=>{


const user=db.prepare(`

SELECT

name,

email,

department,

student_id,

research_interest,

status

FROM users

WHERE id=?

`).get(req.params.id);



res.json(user);


});







// HEALTH CHECK


app.get("/health",(req,res)=>{


res.json({

ok:true,

service:"dcurs"

});


});






app.listen(

process.env.PORT || 3000,

()=>console.log("DCURS server running")

);
