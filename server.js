const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const upload = multer({ dest: path.join(ROOT, 'uploads'), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, /image\/(png|jpeg|webp|gif)/.test(file.mimetype)) });

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'change-this-mira-secret-before-deploy', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 } }));
app.use('/uploads', express.static(path.join(ROOT, 'uploads')));
app.use(express.static(path.join(ROOT, 'public')));

function readDB() { try { const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db.stories ||= []; db.reels ||= []; return db; } catch { return { users: [], posts: [], stories: [], reels: [] }; } }
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function safeUser(user, viewerId) { return { id: user.id, username: user.username, name: user.name, bio: user.bio || '', avatar: user.avatar || '', followers: user.followers || [], following: user.following || [], isFollowing: !!viewerId && (user.followers || []).includes(viewerId), createdAt: user.createdAt }; }
function currentUser(req, db) { return db.users.find(u => u.id === req.session.userId); }
function publicPost(post, db, viewerId) {
  const author = db.users.find(u => u.id === post.userId);
  return { ...post, author: author ? safeUser(author, viewerId) : { username: 'mira', name: 'MIRA' }, liked: (post.likes || []).includes(viewerId), likeCount: (post.likes || []).length, commentCount: (post.comments || []).length };
}
function requireAuth(req, res, next) { const db = readDB(); if (!currentUser(req, db)) return res.status(401).json({ error: 'Сначала войдите в аккаунт.' }); next(); }

app.get('/api/me', (req, res) => { const db = readDB(); const u = currentUser(req, db); res.json({ user: u ? safeUser(u, u.id) : null }); });
app.post('/api/signup', async (req, res) => {
  const { username, name, password } = req.body || {};
  if (!username || !name || !password) return res.status(400).json({ error: 'Заполните все поля.' });
  const clean = String(username).toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24);
  if (clean.length < 3 || String(password).length < 6) return res.status(400).json({ error: 'Ник — минимум 3 символа, пароль — минимум 6.' });
  const db = readDB(); if (db.users.some(u => u.username === clean)) return res.status(409).json({ error: 'Этот ник уже занят.' });
  const user = { id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), username: clean, name: String(name).trim().slice(0, 40), password: await bcrypt.hash(String(password), 10), bio: 'Добро пожаловать в мой мир ✨', avatar: '', followers: [], following: [], createdAt: new Date().toISOString() };
  db.users.push(user); writeDB(db); req.session.userId = user.id; res.json({ user: safeUser(user, user.id) });
});
app.post('/api/login', async (req, res) => {
  const db = readDB(); const username = String(req.body.username || '').toLowerCase(); const user = db.users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) return res.status(401).json({ error: 'Неверный ник или пароль.' });
  req.session.userId = user.id; res.json({ user: safeUser(user, user.id) });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/posts', (req, res) => { const db = readDB(); const me = currentUser(req, db); res.json({ posts: db.posts.slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(p => publicPost(p, db, me?.id)) }); });
app.get('/api/stories', (req, res) => { const db = readDB(); const now = Date.now(); db.stories = db.stories.filter(s => now - new Date(s.createdAt).getTime() < 24 * 60 * 60 * 1000); const stories = db.stories.slice().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map(s => ({ ...s, author: safeUser(db.users.find(u => u.id === s.userId) || { username:'member', name:'Участник' }, req.session.userId) })); res.json({ stories }); });
app.post('/api/stories', requireAuth, upload.single('image'), (req, res) => { if (!req.file) return res.status(400).json({ error: 'Добавьте фотографию в историю.' }); const db = readDB(), user = currentUser(req, db); const story = { id:'s_'+Date.now().toString(36), userId:user.id, image:'/uploads/'+path.basename(req.file.path), caption:String(req.body.caption||'').trim().slice(0,180), createdAt:new Date().toISOString() }; db.stories.push(story); writeDB(db); res.json({ story:{ ...story, author:safeUser(user,user.id) } }); });
app.get('/api/reels', (req,res) => { const db=readDB(); res.json({ reels:db.reels.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(r=>({ ...r, author:safeUser(db.users.find(u=>u.id===r.userId)||{username:'member',name:'Участник'},req.session.userId) })) }); });
app.post('/api/reels', requireAuth, upload.single('image'), (req,res) => { if (!req.file) return res.status(400).json({ error:'Добавьте фотографию для рилса.' }); const db=readDB(), user=currentUser(req,db); const reel={ id:'r_'+Date.now().toString(36), userId:user.id, image:'/uploads/'+path.basename(req.file.path), caption:String(req.body.caption||'').trim().slice(0,300), createdAt:new Date().toISOString(), likes:[] }; db.reels.push(reel); writeDB(db); res.json({ reel:{ ...reel, author:safeUser(user,user.id), likeCount:0, liked:false } }); });
app.post('/api/posts', requireAuth, upload.single('image'), (req, res) => {
  const db = readDB(); const user = currentUser(req, db); const caption = String(req.body.caption || '').trim().slice(0, 1200);
  if (!caption && !req.file) return res.status(400).json({ error: 'Добавьте текст или фотографию.' });
  const post = { id: 'p_' + Date.now().toString(36), userId: user.id, caption, image: req.file ? '/uploads/' + path.basename(req.file.path) : '', location: String(req.body.location || '').slice(0, 80), createdAt: new Date().toISOString(), likes: [], comments: [] };
  db.posts.push(post); writeDB(db); res.json({ post: publicPost(post, db, user.id) });
});
app.post('/api/posts/:id/like', requireAuth, (req, res) => { const db = readDB(), user = currentUser(req, db), post = db.posts.find(p => p.id === req.params.id); if (!post) return res.status(404).json({ error: 'Публикация не найдена.' }); post.likes ||= []; post.likes = post.likes.includes(user.id) ? post.likes.filter(id => id !== user.id) : [...post.likes, user.id]; writeDB(db); res.json({ liked: post.likes.includes(user.id), likeCount: post.likes.length }); });
app.post('/api/posts/:id/comments', requireAuth, (req, res) => { const db = readDB(), user = currentUser(req, db), post = db.posts.find(p => p.id === req.params.id), text = String(req.body.text || '').trim().slice(0, 300); if (!post) return res.status(404).json({ error: 'Публикация не найдена.' }); if (!text) return res.status(400).json({ error: 'Напишите комментарий.' }); post.comments ||= []; post.comments.push({ id: 'c_' + Date.now().toString(36), userId: user.id, username: user.username, name: user.name, text, createdAt: new Date().toISOString() }); writeDB(db); res.json({ comments: post.comments }); });
app.get('/api/users/search', (req, res) => { const db = readDB(), me = currentUser(req, db), q = String(req.query.q || '').toLowerCase().slice(0, 50); res.json({ users: db.users.filter(u => u.id !== me?.id && (u.username.includes(q) || u.name.toLowerCase().includes(q))).slice(0, 12).map(u => safeUser(u, me?.id)) }); });
app.post('/api/users/:id/follow', requireAuth, (req, res) => { const db = readDB(), me = currentUser(req, db), target = db.users.find(u => u.id === req.params.id); if (!target || target.id === me.id) return res.status(404).json({ error: 'Пользователь не найден.' }); target.followers ||= []; me.following ||= []; const following = target.followers.includes(me.id); target.followers = following ? target.followers.filter(id => id !== me.id) : [...target.followers, me.id]; me.following = following ? me.following.filter(id => id !== target.id) : [...me.following, target.id]; writeDB(db); res.json({ following: !following, followers: target.followers.length }); });
app.patch('/api/profile', requireAuth, upload.single('avatar'), (req, res) => { const db = readDB(), me = currentUser(req, db); if (req.body.name) me.name = String(req.body.name).trim().slice(0, 40); if (req.body.bio !== undefined) me.bio = String(req.body.bio).trim().slice(0, 160); if (req.file) me.avatar = '/uploads/' + path.basename(req.file.path); writeDB(db); res.json({ user: safeUser(me, me.id) }); });
app.get('/api/users/:username', (req, res) => { const db = readDB(), me = currentUser(req, db), user = db.users.find(u => u.username === req.params.username.toLowerCase()); if (!user) return res.status(404).json({ error: 'Пользователь не найден.' }); res.json({ user: safeUser(user, me?.id), posts: db.posts.filter(p => p.userId === user.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map(p => publicPost(p, db, me?.id)) }); });

require('./ext')(app,{readDB,writeDB,currentUser,requireAuth,safeUser,ROOT});
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
app.listen(PORT, () => console.log(`MIRA is running at http://localhost:${PORT}`));
