// MIRA ext: видео (YouTube-стиль) и настоящие личные чаты (Telegram-стиль)
const multer = require('multer'), path = require('path'), fs = require('fs'), express = require('express');
module.exports = (app, { readDB, writeDB, currentUser, requireAuth, safeUser, ROOT }) => {
  const up = multer({
    storage: multer.diskStorage({ destination: path.join(ROOT, 'uploads'), filename: (_, f, cb) => cb(null, Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')) }),
    limits: { fileSize: 300 * 1024 * 1024 },
    fileFilter: (_, f, cb) => cb(null, /^(video\/(mp4|webm|ogg|quicktime)|image\/(png|jpeg|webp|gif))$/.test(f.mimetype))
  });
  const nid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const by = (a, b) => b.createdAt.localeCompare(a.createdAt);
  const ghost = { username: 'member', name: 'Участник' };
  const vid = (v, db, me, full) => { const a = db.users.find(u => u.id === v.userId), { likes = [], comments = [], ...r } = v; return { ...r, liked: likes.includes(me), likeCount: likes.length, commentCount: comments.length, ...(full ? { comments } : {}), author: a ? safeUser(a, me) : ghost }; };
  const find = (db, id) => (db.videos || []).find(x => x.id === id);

  // ---------- Видео ----------
  app.get('/api/videos', (req, res) => { const db = readDB(), q = String(req.query.q || '').toLowerCase().slice(0, 60); res.json({ videos: (db.videos || []).filter(v => !q || (v.title + ' ' + v.description).toLowerCase().includes(q)).sort(by).map(v => vid(v, db, req.session.userId)) }); });
  app.post('/api/videos', requireAuth, up.single('video'), (req, res) => {
    const db = readDB(), u = currentUser(req, db), f = req.file, title = String(req.body.title || '').trim().slice(0, 100);
    if (!f || !f.mimetype.startsWith('video/')) return res.status(400).json({ error: 'Выберите видео (MP4, WebM, MOV).' });
    if (!title) return res.status(400).json({ error: 'Добавьте название.' });
    const v = { id: nid('v'), userId: u.id, title, description: String(req.body.description || '').trim().slice(0, 2000), src: '/uploads/' + f.filename, views: 0, likes: [], comments: [], createdAt: new Date().toISOString() };
    (db.videos ||= []).push(v); writeDB(db); res.json({ video: vid(v, db, u.id) });
  });
  app.get('/api/videos/:id', (req, res) => {
    const db = readDB(), v = find(db, req.params.id), me = req.session.userId;
    if (!v) return res.status(404).json({ error: 'Видео не найдено.' });
    v.views = (v.views || 0) + 1; writeDB(db);
    res.json({ video: vid(v, db, me, 1), related: db.videos.filter(x => x.id !== v.id).sort(by).slice(0, 8).map(x => vid(x, db, me)) });
  });
  app.post('/api/videos/:id/like', requireAuth, (req, res) => { const db = readDB(), v = find(db, req.params.id), me = req.session.userId; if (!v) return res.status(404).json({ error: 'Видео не найдено.' }); v.likes ||= []; v.likes = v.likes.includes(me) ? v.likes.filter(i => i !== me) : [...v.likes, me]; writeDB(db); res.json({ liked: v.likes.includes(me), likeCount: v.likes.length }); });
  app.post('/api/videos/:id/comments', requireAuth, (req, res) => {
    const db = readDB(), v = find(db, req.params.id), u = currentUser(req, db), text = String(req.body.text || '').trim().slice(0, 300);
    if (!v) return res.status(404).json({ error: 'Видео не найдено.' }); if (!text) return res.status(400).json({ error: 'Напишите комментарий.' });
    (v.comments ||= []).push({ id: nid('c'), userId: u.id, username: u.username, name: u.name, text, createdAt: new Date().toISOString() }); writeDB(db); res.json({ comments: v.comments });
  });

  // ---------- Чаты ----------
  const pair = (m, a, b) => (m.from === a && m.to === b) || (m.from === b && m.to === a);
  app.get('/api/chats', requireAuth, (req, res) => {
    const db = readDB(), me = req.session.userId, map = new Map();
    (db.messages || []).forEach(m => { if (m.from !== me && m.to !== me) return; const p = m.from === me ? m.to : m.from, c = map.get(p) || { unread: 0 }; c.last = m; if (m.to === me && !m.read) c.unread++; map.set(p, c); });
    res.json({ chats: [...map].map(([p, c]) => ({ user: safeUser(db.users.find(u => u.id === p) || { id: p, ...ghost }, me), last: c.last, unread: c.unread })).sort((a, b) => by(a.last, b.last)) });
  });
  app.get('/api/chats/:username', requireAuth, (req, res) => {
    const db = readDB(), me = req.session.userId, u = db.users.find(x => x.username === req.params.username.toLowerCase());
    if (!u) return res.status(404).json({ error: 'Пользователь не найден.' });
    let ch = 0; const msgs = (db.messages || []).filter(m => pair(m, me, u.id));
    msgs.forEach(m => { if (m.to === me && !m.read) { m.read = true; ch = 1; } }); if (ch) writeDB(db);
    res.json({ user: safeUser(u, me), messages: msgs.slice(-200) });
  });
  app.post('/api/chats/:username', requireAuth, up.single('image'), (req, res) => {
    const db = readDB(), me = currentUser(req, db), u = db.users.find(x => x.username === req.params.username.toLowerCase()), text = String(req.body.text || '').trim().slice(0, 2000);
    if (!u || u.id === me.id) return res.status(404).json({ error: 'Пользователь не найден.' });
    const image = req.file && req.file.mimetype.startsWith('image/') ? '/uploads/' + req.file.filename : '';
    if (!text && !image) return res.status(400).json({ error: 'Пустое сообщение.' });
    const m = { id: nid('m'), from: me.id, to: u.id, text, image, read: false, createdAt: new Date().toISOString() };
    (db.messages ||= []).push(m); writeDB(db); res.json({ message: m });
    if (u.demo) setTimeout(() => { const d = readDB(); (d.messages ||= []).push({ id: nid('m'), from: u.id, to: me.id, text: talk[rnd(0, talk.length - 1)], image: '', read: false, createdAt: new Date().toISOString() }); writeDB(d); }, 2500 + Math.random() * 2500);
  });
  app.get('/api/unread', (req, res) => { const me = req.session.userId; res.json({ count: me ? (readDB().messages || []).filter(m => m.to === me && !m.read).length : 0 }); });

  // ---------- Демо-люди, демо-видео, подборка людей ----------
  app.use('/demo-videos', express.static(path.join(ROOT, 'demo-videos')));
  const people = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-users.json'), 'utf8')), pool = require('./seed-videos')(ROOT);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const talk = ['Привет! Рад(а) знакомству 🙌', 'Спасибо, что написал(а)!', 'Ха, согласен(на) 😄', 'Расскажи подробнее?', 'Классно! Загляни ко мне в видео ✨', 'Увидел(а) сообщение, отвечу позже 😉'];
  const nice = ['Очень круто!', 'Смотрел(а) дважды 🔥', 'Спасибо за видео!', 'Подписался(ась) 👍', 'Как раз то, что нужно сегодня', 'Класс, жду продолжения'];
  function release(db, n, gap) {
    const have = new Set((db.videos ||= []).map(v => v.seedKey)), demo = db.users.filter(u => u.demo); let k = 0;
    for (const s of pool) {
      if (k >= n) break; if (have.has(s.key)) continue;
      const a = demo.find(u => u.username === s.by) || demo[0], t = new Date(Date.now() - k * gap).toISOString();
      const comments = Array.from({ length: rnd(1, 3) }, () => { const c = demo[rnd(0, demo.length - 1)]; return { id: nid('c'), userId: c.id, username: c.username, name: c.name, text: nice[rnd(0, nice.length - 1)], createdAt: t }; });
      db.videos.push({ id: nid('v'), userId: a.id, title: s.title, description: s.desc, src: s.src, poster: s.poster || '', views: rnd(800, 60000), likes: Array.from({ length: rnd(15, 420) }, (_, i) => 'f' + i), comments, createdAt: t, seedKey: s.key, demo: true }); k++;
    }
    return k;
  }
  (() => {
    const db = readDB(); let ch = 0;
    people.forEach(p => { if (!db.users.some(u => u.username === p.username)) { db.users.push({ id: 'u_' + p.id, username: p.username, name: p.name, bio: p.bio || '', avatar: p.avatar, password: '!', demo: true, followers: [], following: [], createdAt: new Date(Date.now() - 30 * 864e5).toISOString() }); ch = 1; } });
    const before = (db.videos || []).length; db.videos = (db.videos || []).filter(v => !v.demo || pool.some(s => s.key === v.seedKey)); const have = db.videos.filter(v => v.demo).length;
    if (db.videos.length !== before || have < 12) { release(db, Math.max(0, 12 - have), 2 * 36e5); ch = 1; }
    if (ch) writeDB(db);
    setInterval(() => { const d = readDB(), k = release(d, 1, 0); d.videos.forEach(v => { if (v.demo) v.views += rnd(5, 60); }); writeDB(d); if (k) console.log('Новое демо-видео опубликовано'); }, 30000);
  })();
  app.get('/api/suggestions', (req, res) => { const db = readDB(), me = req.session.userId; res.json({ users: db.users.filter(u => u.id !== me).sort((a, b) => (a.followers || []).includes(me) - (b.followers || []).includes(me)).slice(0, 8).map(u => safeUser(u, me)) }); });
};
