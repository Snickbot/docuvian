// Docuvian Phase 1: local projects, scenes, reference images. No AI providers yet.
const KEY = 'docuvian.v1';
const app = document.getElementById('app');
const homeBtn = document.getElementById('home');
let db = load(), pid = null;
db.projects.forEach(p => (p.jobs || []).forEach(j => { if (j.status === 'PROCESSING' || j.status === 'RETRYING') j.status = 'WAITING'; }));
const label = t => { t = String(t).replace('_', ' ').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { projects: [] }; } catch (e) { return { projects: [] }; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('Browser storage is full. Remove some reference images or scenes, then try again.'); } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const proj = () => db.projects.find(p => p.id === pid);
const words = t => (t.trim().match(/\S+/g) || []).length;

function newScene(narration, title) {
  return { id: uid(), title: title || 'Untitled scene', narration: narration || '', dur: Math.max(3, Math.round(words(narration || '') / 2.5)),
    visual: '', prompt: '', ref: '', provider: '', status: 'Waiting', error: '' };
}

function splitScript(text) {
  let parts = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    const sents = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [];
    parts = [];
    for (let i = 0; i < sents.length; i += 2) parts.push(sents.slice(i, i + 2).join(' ').trim());
  }
  return parts.filter(Boolean).map((p, i) => newScene(p, 'Scene ' + (i + 1)));
}

function shrink(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = no;
    r.onload = () => {
      const im = new Image();
      im.onerror = no;
      im.onload = () => {
        const k = Math.min(1, 640 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.7));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function homeView() {
  pid = null; homeBtn.hidden = true;
  const list = db.projects.map(p => `<div class="card"><b>${esc(p.title)}</b>
    <div class="mute">${p.scenes.length} scenes, ${p.ratio}, ${esc(p.style)}</div>
    <div class="row"><button data-act="open" data-id="${p.id}">Open</button><button class="bad" data-act="delproj" data-id="${p.id}">Delete</button></div></div>`).join('');
  app.innerHTML = `<h1>Projects</h1>${list || '<p class="mute">No projects yet. Create your first one below.</p>'}
  <form class="card" id="newp"><h2>New project</h2>
  <label>Project title<input name="title" required maxlength="120"></label>
  <label>Documentary script<textarea name="script" required rows="8" placeholder="Paste your script. Blank lines split scenes; without them, every two sentences become a scene."></textarea></label>
  <div class="two"><label>Language<input name="lang" value="English"></label>
  <label>Aspect ratio<select name="ratio"><option>16:9</option><option>9:16</option><option>1:1</option></select></label></div>
  <div class="two"><label>Target duration (min)<input name="mins" type="number" min="1" value="5"></label>
  <label>Visual style<input name="style" value="Cinematic investigative documentary"></label></div>
  <label>Narration style<input name="narr" value="Calm, authoritative"></label>
  <div class="row"><button type="submit">Create project and split scenes</button></div></form>`;
}

function projectView() {
  const p = proj(); homeBtn.hidden = false;
  app.innerHTML = `<h1>${esc(p.title)}</h1>
  <div class="mute">${p.ratio} · ${esc(p.lang)} · ${esc(p.style)} · ${esc(p.narr)} · target ${p.mins} min</div>
  <div class="card" id="dash"></div>
  <div class="card" id="queue"></div>
  <div class="row"><button data-act="addscene">Add scene</button></div><div style="height:12px"></div>
  ${p.scenes.map((s, i) => sceneHTML(s, i, p.scenes.length)).join('')}`;
  ui(); runQueue(p.id);
}

function dash() {
  const p = proj(), n = p.scenes.length;
  const ready = p.scenes.filter(s => s.narration.trim() && s.prompt.trim()).length;
  const pics = p.scenes.filter(s => s.ref).length;
  const secs = p.scenes.reduce((a, s) => a + (+s.dur || 0), 0);
  document.getElementById('dash').innerHTML = `<b>Planning progress: ${n ? Math.round(ready / n * 100) : 0}%</b>
  <div class="bar"><i style="width:${n ? ready / n * 100 : 0}%"></i></div>
  <div class="stats"><div><b>${ready} / ${n}</b>scenes with narration and prompt</div>
  <div><b>${pics} / ${n}</b>scenes with reference image</div>
  <div><b>${Math.floor(secs / 60)}m ${secs % 60}s</b>estimated length</div>
  <div><b>${p.scenes.filter(s => String(s.status).toUpperCase() === 'COMPLETED').length} / ${n}</b>clips completed (mock providers only)</div>
  <div><b>Not built yet</b>voiceover</div><div><b>Not built yet</b>captions and final assembly</div></div>`;
}

function sceneHTML(s, i, n) {
  return `<details class="card" data-i="${i}"><summary><b>${i + 1}.</b> ${esc(s.title)}<span class="tag">${label(s.status)}</span></summary>
  <label>Title<input data-f="title" value="${esc(s.title)}"></label>
  <label>Narration<textarea data-f="narration">${esc(s.narration)}</textarea></label>
  <label>Visual description<textarea data-f="visual">${esc(s.visual)}</textarea></label>
  <label>Video prompt<textarea data-f="prompt">${esc(s.prompt)}</textarea></label>
  <label>Duration (seconds)<input data-f="dur" type="number" min="1" value="${s.dur}"></label>
  <label>Reference image<input type="file" accept="image/*" data-img></label>
  ${s.ref ? `<img class="ref" src="${s.ref}" alt="Reference for scene ${i + 1}"><div class="row"><button class="alt" data-act="rmimg">Remove image</button></div>` : ''}
  <label>Provider<select data-f="provider"><option value="">Auto (by priority)</option>${PROVIDERS.map(x => `<option value="${x.id}" ${s.provider === x.id ? 'selected' : ''} ${s.ref && !x.caps.refs ? 'disabled' : ''}>${esc(x.name)}${s.ref && !x.caps.refs ? ' (no reference images)' : ''}</option>`).join('')}</select></label>
  <div class="row"><button class="alt" data-act="up" ${i === 0 ? 'disabled' : ''}>Move up</button><button class="alt" data-act="down" ${i === n - 1 ? 'disabled' : ''}>Move down</button>
  <button class="alt" data-act="dup">Duplicate</button><button class="bad" data-act="del">Delete</button></div></details>`;
}

app.addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const scenes = splitScript(f.script);
  if (!scenes.length) return alert('The script has no usable text.');
  const p = { id: uid(), title: f.title.trim(), lang: f.lang, ratio: f.ratio, mins: +f.mins || 5, style: f.style, narr: f.narr, scenes };
  db.projects.unshift(p); save(); pid = p.id; projectView();
});

app.addEventListener('change', async e => {
  const t = e.target, card = t.closest('[data-i]');
  if (t.dataset.p) { proj()[t.dataset.p] = Math.min(5, Math.max(1, +t.value || 2)); save(); return; }
  if (!card) return;
  const s = proj().scenes[+card.dataset.i];
  if (t.dataset.f) { s[t.dataset.f] = t.type === 'number' ? Math.max(1, +t.value || 1) : t.value; save(); dash(); if (t.dataset.f === 'title') card.querySelector('summary').childNodes[2].textContent = ' ' + t.value; }
  if (t.hasAttribute('data-img') && t.files[0]) {
    try { s.ref = await shrink(t.files[0]); save(); const o = card.open; projectView(); document.querySelector(`[data-i="${card.dataset.i}"]`).open = o; }
    catch (err) { alert('That file could not be read as an image. Try a JPG or PNG.'); }
  }
});

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, card = b.closest('[data-i]'), i = card ? +card.dataset.i : -1;
  if (a === 'open') { pid = b.dataset.id; return projectView(); }
  if (a === 'delproj') { if (confirm('Delete this project and all its scenes?')) { db.projects = db.projects.filter(p => p.id !== b.dataset.id); save(); homeView(); } return; }
  if (['gen', 'genall', 'retryfailed', 'copy', 'dlref', 'markdone'].includes(a)) return queueAct(a, i);
  const sc = proj().scenes;
  if (a === 'addscene') sc.push(newScene('', 'Scene ' + (sc.length + 1)));
  else if (a === 'up' && i > 0) [sc[i - 1], sc[i]] = [sc[i], sc[i - 1]];
  else if (a === 'down' && i < sc.length - 1) [sc[i + 1], sc[i]] = [sc[i], sc[i + 1]];
  else if (a === 'dup') sc.splice(i + 1, 0, { ...sc[i], id: uid(), title: sc[i].title + ' (copy)' });
  else if (a === 'del') { if (!confirm('Delete this scene?')) return; sc.splice(i, 1); }
  else if (a === 'rmimg') sc[i].ref = '';
  save(); projectView();
});

homeBtn.onclick = homeView;
homeView();
