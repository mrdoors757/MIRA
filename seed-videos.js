// Пул демо-видео: demo-videos/manifest.json (сгенерированные ролики) + любые твои .mp4/.webm/.mov из папки demo-videos/.
// Каждое видео выходит в ленту ровно один раз.
const fs = require('fs'), path = require('path');
module.exports = ROOT => {
  const dir = path.join(ROOT, 'demo-videos'), by = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-users.json'), 'utf8')).map(p => p.username);
  let man = []; try { man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch {}
  const out = man.map(m => ({ key: 'local:' + m.file, src: '/demo-videos/' + m.file, poster: '/demo-videos/' + m.poster, title: m.title, desc: m.desc, by: m.by }));
  const known = new Set(man.map(m => m.file));
  try { fs.readdirSync(dir).filter(f => /\.(mp4|webm|mov)$/i.test(f) && !known.has(f)).forEach((f, i) => out.push({ key: 'local:' + f, src: '/demo-videos/' + encodeURIComponent(f), poster: '', title: f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), desc: 'Видео из локальной коллекции.', by: by[(i + 5) % by.length] })); } catch {}
  return out;
};
