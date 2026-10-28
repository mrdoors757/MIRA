// MIRA ext (клиент): видеоплатформа + мессенджер. Использует функции app.js (api, openModal, toast, esc, avatarMarkup, timeAgo...)
(() => {
const $x = s => document.querySelector(s), stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
let P, timer, cur, sig = '', seen = new Set();
const n = x => (x || 0).toLocaleString('ru-RU');
const nav = v => document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
const need = () => { if (state.user) return 1; authModal('login'); };
const mt = d => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
function page(h) {
  if (!P) { P = document.createElement('div'); P.className = 'xp'; P.onclick = e => { const t = e.target.closest('[data-a]'); if (t && A[t.dataset.a]) A[t.dataset.a](t.dataset.id, t); }; document.body.append(P); }
  const s = $x('.sidebar'); P.style.left = innerWidth > 900 && s ? s.offsetWidth + 'px' : '0'; P.hidden = false; P.innerHTML = h;
}
function shut() { clearInterval(timer); cur = 0; if (P) P.hidden = true; }

// ---------- ВИДЕО ----------
const card = v => `<div class="xcard" data-a="watch" data-id="${esc(v.id)}">${v.poster ? `<img src="${esc(v.poster)}" alt="">` : `<video src="${esc(v.src)}#t=0.5" preload="metadata" muted></video>`}<b>${esc(v.title)}</b><div class="xm">${avatarMarkup(v.author, 'avatar xs')}<span>@${esc(v.author.username)} · 👁 ${n(v.views)} · ♥ ${v.likeCount} · ${timeAgo(v.createdAt)}</span></div></div>`;
const cm = c => `<div class="xcm"><b>${esc(c.username)}</b> ${esc(c.text)}<small> ${timeAgo(c.createdAt)}</small></div>`;
function videos() {
  nav('videos'); shut();
  page(`<div class="xh"><b>▶ Видео</b><input id="xvq" placeholder="Поиск видео…" autocomplete="off"><button class="primary-button" data-a="up">＋ Загрузить</button></div><div class="xg" id="xg"></div>`);
  $x('#xvq').oninput = e => { clearTimeout(videos.t); videos.t = setTimeout(() => fill(e.target.value), 250); }; seen = new Set(); fill(''); timer = setInterval(() => { if ($x('#xg') && !$x('#xvq').value) fill('', 1); }, 10000);
}
async function fill(q, poll) { try { const { videos: v } = await api('/api/videos?q=' + encodeURIComponent(q)), g = $x('#xg'); if (!g) return; const fresh = seen.size ? v.filter(x => !seen.has(x.id)) : []; if (poll && !fresh.length) return; v.forEach(x => seen.add(x.id)); g.innerHTML = v.length ? v.map(card).join('') : `<div class="xe">${q ? 'Ничего не найдено' : 'Пока нет видео — загрузи первое!'}</div>`; fresh.forEach(x => g.querySelector('[data-id="' + x.id + '"]')?.classList.add('xnew')); if (poll && fresh.length) toast('Новое видео: ' + fresh[0].title); } catch (e) { if (!poll) toast(e.message); } }
async function watch(id) {
  try {
    const { video: v, related } = await api('/api/videos/' + id); nav('videos'); shut();
    page(`<div class="xw"><div class="xmain"><button class="outline-button" data-a="vids">← Все видео</button><video class="xpl" poster="${esc(v.poster || '')}" src="${esc(v.src)}" controls autoplay loop playsinline></video><div class="xstat">👁 <b>${n(v.views)}</b> просмотров · ♥ ${n(v.likeCount)} · 💬 ${v.commentCount}</div><h2>${esc(v.title)}</h2><div class="xrow"><div class="xrow xlink" data-profile="${esc(v.author.username)}">${avatarMarkup(v.author)}<div><b>${esc(v.author.name)}</b><br><small>@${esc(v.author.username)}</small></div></div>${v.author.id === state.user?.id ? '' : `<button class="follow-button ${v.author.isFollowing ? 'following' : ''}" data-follow="${esc(v.author.id)}">${v.author.isFollowing ? 'Читаешь' : '＋ Читать'}</button><button class="outline-button" data-a="msg" data-id="${esc(v.author.username)}">✉ Написать</button>`}<span class="xsp"></span><button class="outline-button ${v.liked ? 'on' : ''}" data-a="vlike" data-id="${esc(v.id)}">${v.liked ? '♥' : '♡'} ${v.likeCount}</button><button class="outline-button" data-a="vshare" data-id="${esc(v.id)}">↗ Поделиться</button></div><div class="xdesc"><b>${timeAgo(v.createdAt)}</b><p>${formatCaption(v.description || '')}</p></div><h3>Комментарии</h3><form id="xcf"><input name="text" placeholder="Добавить комментарий…" maxlength="300" required><button class="primary-button">Отправить</button></form><div id="xcl">${v.comments.slice().reverse().map(cm).join('')}</div></div><aside class="xrel"><h3>Ещё видео</h3>${related.map(card).join('')}</aside></div>`);
    $x('#xcf').onsubmit = async e => { e.preventDefault(); if (!need()) return; const f = e.target; try { const r = await api('/api/videos/' + id + '/comments', { method: 'POST', body: JSON.stringify({ text: f.text.value }) }); f.reset(); $x('#xcl').innerHTML = r.comments.slice().reverse().map(cm).join(''); } catch (x) { toast(x.message); } };
  } catch (e) { toast(e.message); }
}

// ---------- ЧАТЫ ----------
const row = (u, t, when, n) => `<div class="xr ${cur === u.username ? 'on' : ''}" data-a="th" data-id="${esc(u.username)}">${avatarMarkup(u)}<div class="xi"><b>${esc(u.name)}</b><small>${esc(t)}</small></div><div class="xs"><small>${when}</small>${n ? `<i>${n}</i>` : ''}</div></div>`;
async function list(q = '') {
  const L = $x('#xlist'); if (!L) return;
  try {
    if (q.trim()) { const { users } = await api('/api/users/search?q=' + encodeURIComponent(q)); L.innerHTML = users.map(u => row(u, '@' + u.username, '', 0)).join('') || '<div class="xe">Никого не найдено</div>'; }
    else { const { chats: c } = await api('/api/chats'); L.innerHTML = c.map(x => row(x.user, (x.last.from === state.user.id ? 'Вы: ' : '') + (x.last.text || '📷 Фото'), timeAgo(x.last.createdAt), x.unread)).join('') || '<div class="xe">Диалогов пока нет.<br>Найди человека выше ↑</div>'; }
  } catch {}
}
function chats(open) {
  if (!need()) return; nav('messages'); shut();
  page(`<div class="xc"><aside class="xl"><div class="xh"><b>✉ Чаты</b><input id="xq" placeholder="Найти человека…" autocomplete="off"></div><div id="xlist"></div></aside><section class="xt" id="xth"><div class="xe">Выбери чат или найди человека 💬</div></section></div>`);
  $x('#xq').oninput = e => { clearTimeout(chats.t); chats.t = setTimeout(() => list(e.target.value), 250); };
  list(); timer = setInterval(() => { list($x('#xq')?.value); if (cur) thread(cur, 1); }, 3000); if (open) thread(open);
}
async function thread(u, quiet) {
  try {
    const { user, messages: ms } = await api('/api/chats/' + encodeURIComponent(u)), T = $x('#xth'); if (!T) return;
    const s = ms.length + ':' + ms.filter(m => m.read).length; if (quiet && cur === u && s === sig) return;
    const fresh = cur !== u; cur = u; sig = s; $x('.xc').classList.add('open');
    if (fresh || !$x('#xmsgs')) { T.innerHTML = `<div class="xth-h"><button class="xback" data-a="cl">←</button>${avatarMarkup(user)}<div><b>${esc(user.name)}</b><br><small>@${esc(user.username)}</small></div></div><div id="xmsgs" class="xmsgs"></div><form id="xsf" class="xsf"><label class="xat">📎<input type="file" name="image" accept="image/*" hidden></label><input name="text" placeholder="Сообщение…" maxlength="2000" autocomplete="off"><button class="primary-button">➤</button></form>`; $x('#xsf').onsubmit = send; }
    const M = $x('#xmsgs'), near = fresh || M.scrollHeight - M.scrollTop - M.clientHeight < 80;
    M.innerHTML = ms.map(m => { const me = m.from === state.user.id; return `<div class="xb ${me ? 'me' : ''}">${m.image ? `<img src="${esc(m.image)}" alt="">` : ''}${esc(m.text)}<small>${mt(m.createdAt)}${me ? (m.read ? ' ✓✓' : ' ✓') : ''}</small></div>`; }).join('') || '<div class="xe">Напиши первое сообщение 👋</div>';
    if (near) M.scrollTop = M.scrollHeight; list($x('#xq')?.value); if (fresh) $x('#xsf').text.focus();
  } catch (e) { if (!quiet) toast(e.message); }
}
async function send(e) {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  if (!String(fd.get('text')).trim() && !fd.get('image')?.size) return; f.reset();
  try { await api('/api/chats/' + encodeURIComponent(cur), { method: 'POST', body: fd }); sig = ''; thread(cur, 1); } catch (x) { toast(x.message); }
}
async function pip() {
  if (!state.user) return;
  try { const { count } = await api('/api/unread'), p = $x('.message-pip'); if (p) { p.textContent = count || ''; p.style.cssText = count ? 'display:inline-block;background:#e66d51;color:#fff;border-radius:9px;padding:1px 7px;font-size:11px;margin-left:auto' : 'display:none'; } } catch {}
}

renderSuggestions = async () => {
  const el = $x('#suggestions'); if (!el) return;
  try { const { users } = await api('/api/suggestions'); el.innerHTML = users.map(u => `<div class="suggestion-row">${avatarMarkup(u)}<div class="suggestion-info"><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></div><button class="follow-button ${u.isFollowing ? 'following' : ''}" data-follow="${esc(u.id)}">${u.isFollowing ? 'Читаешь' : '＋ Читать'}</button><button class="follow-button chat-action" data-chat-user="${esc(u.username)}" title="Написать">✉</button></div>`).join(''); } catch {}
};
// ---------- действия и интеграция ----------
const A = {
  watch: id => watch(id), msg: u => chats(u), vids: videos, th: u => thread(u), cl: () => { cur = 0; $x('.xc').classList.remove('open'); },
  vlike: async (id, b) => { if (!need()) return; try { const r = await api('/api/videos/' + id + '/like', { method: 'POST', body: '{}' }); b.textContent = (r.liked ? '♥ ' : '♡ ') + r.likeCount; b.classList.toggle('on', r.liked); } catch (e) { toast(e.message); } },
  vshare: id => { const u = location.origin + '/#video-' + id; navigator.clipboard ? navigator.clipboard.writeText(u).then(() => toast('Ссылка скопирована')) : toast(u); },
  up: () => {
    if (!need()) return;
    openModal(`<h2>Загрузить видео</h2><p class="modal-subtitle">MP4, WebM или MOV · до 300 МБ</p><form id="xuf"><div class="form-field"><label>Название</label><input name="title" maxlength="100" required></div><div class="form-field"><label>Описание (можно #теги)</label><textarea name="description" maxlength="2000"></textarea></div><label class="file-drop"><span>▶</span><span id="xfn">Выбрать видеофайл</span><input type="file" name="video" accept="video/mp4,video/webm,video/quicktime,video/ogg" required></label><button class="primary-button modal-submit">Опубликовать</button></form>`, 'xup');
    const f = $x('#xuf'); f.video.onchange = e => { $x('#xfn').textContent = e.target.files[0]?.name || ''; };
    f.onsubmit = e => {
      e.preventDefault(); const b = f.querySelector('button'), x = new XMLHttpRequest(); x.open('POST', '/api/videos'); b.disabled = true;
      x.upload.onprogress = p => { b.textContent = 'Загрузка ' + Math.round(p.loaded / p.total * 100) + '%'; };
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} if (x.status < 300) { closeModal(); watch(d.video.id); } else { b.disabled = false; b.textContent = 'Опубликовать'; toast(d.error || 'Ошибка загрузки'); } };
      x.onerror = () => { b.disabled = false; toast('Ошибка сети'); }; x.send(new FormData(f));
    };
  }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-view],[data-chat-user]'); if (!t || t.closest('.xp')) return;
  const v = t.dataset.view;
  if (v === 'videos') { stop(e); videos(); } else if (v === 'messages' || t.dataset.chatUser) { stop(e); chats(t.dataset.chatUser); } else if (P && !P.hidden) shut();
}, true);
$x('.main-nav')?.insertAdjacentHTML('beforeend', '<button class="nav-item" data-view="videos"><span class="nav-icon">▶</span><span>Видео</span></button>');
$x('.mobile-nav [data-view="explore"]')?.insertAdjacentHTML('afterend', '<button data-view="videos"><span>▶</span><small>Видео</small></button>');
if (location.hash.startsWith('#video-')) watch(location.hash.slice(7));
renderSuggestions(); setInterval(pip, 8000); setTimeout(pip, 1500);
})();
