const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';

const db = new Database(process.env.DB_FILE || path.join(__dirname, 'dcurs.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, department TEXT NOT NULL,
  campus TEXT NOT NULL, studentId TEXT, phone TEXT, interests TEXT NOT NULL,
  motivation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
  createdAt TEXT NOT NULL
)`);

app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));

function sign(payload){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body+'.'+sig;
}
function auth(req,res,next){
  const h=req.headers.authorization||'';
  const [body,sig]=h.replace('Bearer ','').split('.');
  if(!body||!sig)return res.status(401).json({error:'Authentication required'});
  const expected=crypto.createHmac('sha256',SESSION_SECRET).update(body).digest('base64url');
  if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return res.status(401).json({error:'Invalid session'});
  const p=JSON.parse(Buffer.from(body,'base64url').toString());
  if(p.exp<Date.now())return res.status(401).json({error:'Session expired'});
  next();
}
function clean(v){return String(v||'').trim();}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}

app.post('/api/login',(req,res)=>{
  const u=clean(req.body.username), p=String(req.body.password||'');
  if(u!==ADMIN_USERNAME || p!==ADMIN_PASSWORD)return res.status(401).json({error:'Invalid username or password'});
  res.json({token:sign({sub:u,exp:Date.now()+8*60*60*1000})});
});

app.post('/api/applications',(req,res)=>{
  const d=req.body||{};
  const fields=['name','email','department','campus','interests','motivation'];
  if(fields.some(k=>!clean(d[k])))return res.status(400).json({error:'Please complete all required fields'});
  if(!validEmail(clean(d.email)))return res.status(400).json({error:'Invalid email address'});
  const n=db.prepare('SELECT COUNT(*) c FROM applications').get().c+1;
  const id=`DCURS-${new Date().getFullYear()}-${String(n).padStart(4,'0')}`;
  db.prepare(`INSERT INTO applications
    (id,name,email,department,campus,studentId,phone,interests,motivation,status,createdAt)
    VALUES (@id,@name,@email,@department,@campus,@studentId,@phone,@interests,@motivation,'Pending',@createdAt)`).run({
      id,name:clean(d.name),email:clean(d.email),department:clean(d.department),campus:clean(d.campus),
      studentId:clean(d.studentId),phone:clean(d.phone),interests:clean(d.interests),motivation:clean(d.motivation),
      createdAt:new Date().toISOString()
  });
  res.status(201).json({id});
});

app.get('/api/applications',auth,(req,res)=>{
  res.json(db.prepare('SELECT * FROM applications ORDER BY createdAt DESC').all());
});

app.patch('/api/applications/:id',auth,(req,res)=>{
  const status=req.body.status;
  if(!['Pending','Approved','Rejected'].includes(status))return res.status(400).json({error:'Invalid status'});
  const result=db.prepare('UPDATE applications SET status=? WHERE id=?').run(status,req.params.id);
  if(!result.changes)return res.status(404).json({error:'Application not found'});
  res.json({ok:true});
});

app.get('/health',(req,res)=>res.json({ok:true,service:'dcurs'}));

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`DCURS running at http://localhost:${PORT}`));
