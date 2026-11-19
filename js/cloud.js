/* SAN Ledger — cloud sync (Neon Auth + Neon Data API)
   One business account (email + password) holds one "books" row with the whole ledger as JSON.
   Owner and Cashier sign in with the same account, then pick their role with a PIN.
   Every device keeps a local copy; changes are pushed with a version check and merged record-by-record
   if another device saved first. */
const CLOUD_DB_URL = 'https://ep-summer-sunset-az9ase49.c-3.ap-southeast-1.aws.neon.tech/neondb';
const CLOUD_SDK = 'https://cdn.jsdelivr.net/npm/@neon/neon-js@0.10.2/+esm';

const Cloud = {
  status: 'loading',   // loading | signedOut | ready | error
  sync: 'synced',      // synced | saving | offline
  user: null, client: null, version: 0, base: null, error: '',
  pushing: false, dirty: false, timer: null, force: false,

  demo: false,
  async init() {
    if (isDemo()) {
      this.demo = true; this.user = { email: 'demo', id: 'demo' }; demoDB(); this.status = 'ready';
      render(); return;
    }
    try {
      const { createClient } = await import(CLOUD_SDK);
      this.client = createClient(CLOUD_DB_URL);
      const { data } = await this.client.auth.getSession();
      if (data && data.session && data.user) { this.user = data.user; await this.load(); }
      else this.status = 'signedOut';
    } catch (e) {
      console.error(e); this.status = 'error'; this.error = String(e.message || e);
    }
    render();
    setInterval(() => this.poll(), 15000);
    window.addEventListener('online', () => this.schedule(0));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
  },

  cacheKey() { return DB_KEY + ':' + (this.user ? this.user.id : 'none'); },

  async signIn(email, password) {
    const r = await this.client.auth.signIn.email({ email, password });
    if (r.error) return r.error.message || t('Sign-in failed');
    this.user = r.data.user; await this.load(); render(); return '';
  },
  async signUp(name, email, password) {
    const r = await this.client.auth.signUp.email({ email, password, name: name || email });
    if (r.error) return r.error.message || t('Sign-up failed');
    this.user = r.data.user; await this.load(); render(); return '';
  },
  async signOut() {
    if (this.demo) { location.href = location.pathname; return; }
    await this.flush();
    try { await this.client.auth.signOut(); } catch (e) { console.error(e); }
    Session.role = ''; this.user = null; this.base = null; this.version = 0; this.status = 'signedOut';
    db = defaultDB(); render();
  },

  async load() {
    this.status = 'loading'; render();
    // Show the cached copy straight away, then replace it with the server copy.
    try { const c = localStorage.getItem(this.cacheKey()); if (c) db = migrate(JSON.parse(c)); } catch (e) { /* ignore */ }
    const { data, error } = await this.client.from('books').select('data,version').maybeSingle();
    if (error) {
      console.error(error);
      if (localStorage.getItem(this.cacheKey())) { this.status = 'ready'; this.sync = 'offline'; return; }
      this.status = 'error'; this.error = error.message; return;
    }
    if (data) {
      db = migrate(data.data); this.version = data.version; this.base = JSON.parse(JSON.stringify(data.data));
    } else {
      // First sign-in for this account: upload what this device already has (if anything).
      const legacy = localStorage.getItem(DB_KEY);
      db = legacy ? migrate(JSON.parse(legacy)) : defaultDB();
      const ins = await this.client.from('books').insert({ data: db, version: 1 }).select('version').single();
      if (ins.error) { this.status = 'error'; this.error = ins.error.message; return; }
      this.version = 1; this.base = JSON.parse(JSON.stringify(db));
    }
    localStorage.setItem(this.cacheKey(), JSON.stringify(db));
    this.status = 'ready'; this.sync = 'synced';
  },

  saved() {
    if (this.status !== 'ready' || this.demo) return;
    localStorage.setItem(this.cacheKey(), JSON.stringify(db));
    this.schedule(700);
  },
  schedule(ms) {
    this.dirty = true; this.setSync('saving');
    clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), ms);
  },
  setSync(s) {
    if (this.sync === s) return; this.sync = s;
    const el = document.getElementById('sync-pill'); if (el) el.outerHTML = syncPillHTML();
  },

  async push() {
    if (this.pushing || !this.dirty || this.status !== 'ready') return;
    this.pushing = true; this.dirty = false;
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const sending = JSON.parse(JSON.stringify(db));
        const { data, error } = await this.client.from('books')
          .update({ data: sending, version: this.version + 1, updated_at: new Date().toISOString() })
          .eq('version', this.version).select('version');
        if (error) throw error;
        if (data && data.length) { this.version = data[0].version; this.base = sending; this.force = false; break; }
        // Someone else saved first: fetch their copy and merge ours into it.
        const remote = await this.client.from('books').select('data,version').single();
        if (remote.error) throw remote.error;
        db = this.force ? db : migrate(merge3(this.base, db, remote.data.data));
        this.version = remote.data.version; this.base = remote.data.data;
      }
      localStorage.setItem(this.cacheKey(), JSON.stringify(db));
      this.setSync(this.dirty ? 'saving' : 'synced');
      if (!document.querySelector('#modal .modal')) render();
    } catch (e) {
      console.error(e); this.dirty = true; this.setSync('offline');
      clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 10000);
    } finally {
      this.pushing = false;
      if (this.dirty && this.sync !== 'offline') this.push();
    }
  },
  async flush() { clearTimeout(this.timer); if (this.dirty) await this.push(); },

  async poll() {
    if (this.status !== 'ready' || this.pushing || this.dirty || document.hidden) return;
    if (document.querySelector('#modal .modal')) return; // don't change data under an open form
    try {
      const v = await this.client.from('books').select('version').single();
      if (v.error) throw v.error;
      if (v.data.version === this.version) { this.setSync('synced'); return; }
      const r = await this.client.from('books').select('data,version').single();
      if (r.error) throw r.error;
      if (this.dirty || this.pushing) return;
      db = migrate(r.data.data); this.version = r.data.version; this.base = r.data.data;
      localStorage.setItem(this.cacheKey(), JSON.stringify(db));
      this.setSync('synced');
      if (!document.querySelector('#modal .modal')) render();
    } catch (e) { console.error(e); this.setSync('offline'); }
  },
};

/* Three-way merge: base = last copy both sides agreed on, L = this device, R = server.
   Records (objects with an id in top-level lists) are merged one by one; a change on either side wins
   over an unchanged copy, and this device wins if both changed the same record. */
function merge3(B, L, R) {
  if (!B) return R;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = {};
  for (const k of new Set([...Object.keys(L), ...Object.keys(R)])) {
    const b = B[k], l = L[k], r = R[k];
    if (Array.isArray(l) && Array.isArray(r) && [...l, ...r].every((x) => x && typeof x === 'object' && x.id)) out[k] = mergeList(b || [], l, r);
    else if (k === 'counters') { out[k] = { ...(r || {}) }; for (const c in l || {}) out[k][c] = Math.max(num(l[c]), num(out[k][c])); }
    else out[k] = same(l, b) ? r : l;
  }
  if (Array.isArray(out.audit)) out.audit.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return out;
}
function mergeList(B, L, R) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const bm = new Map(B.map((x) => [x.id, x])), lm = new Map(L.map((x) => [x.id, x]));
  const res = []; const seen = new Set();
  for (const r of R) {
    seen.add(r.id);
    const l = lm.get(r.id), b = bm.get(r.id);
    if (l) res.push(b && same(l, b) ? r : l);
    else if (!b || !same(r, b)) res.push(r); // deleted here but changed there → keep theirs
  }
  for (const l of L) {
    if (seen.has(l.id)) continue;
    const b = bm.get(l.id);
    if (!b || !same(l, b)) res.push(l); // new here, or changed here while deleted there
  }
  return res;
}

function syncPillHTML() {
  if (Cloud.demo) return `<span id="sync-pill" class="pill sync warn">${esc(t('Demo — not saved'))}</span>`;
  const map = { synced: ['Synced', 'ok'], saving: ['Saving…', ''], offline: ['Offline — will retry', 'warn'] };
  const [label, cls] = map[Cloud.sync] || map.synced;
  return `<span id="sync-pill" class="pill sync ${cls}" title="${esc(Cloud.user ? Cloud.user.email : '')}">${esc(t(label))}</span>`;
}

/* ---------- account sign-in screen ---------- */
let cloudMode = 'in';
function cloudScreenHTML() {
  const langT = `<div class="lang-toggle center"><button class="${curLang() === 'en' ? 'on' : ''}" onclick="${act(() => setLang('en'))}">English</button><button class="${curLang() === 'my' ? 'on' : ''}" onclick="${act(() => setLang('my'))}">မြန်မာ</button></div>`;
  if (Cloud.status === 'loading') return `<div class="login-bg"><div class="login-card"><h2>SAN Ledger</h2><p class="muted">${esc(t('Connecting…'))}</p></div></div>`;
  if (Cloud.status === 'error') return `<div class="login-bg"><div class="login-card">${langT}<h2>${esc(t('Cannot reach the server'))}</h2>
    <p class="muted">${esc(t('Check the internet connection and try again.'))}</p><p class="muted sm">${esc(Cloud.error)}</p>
    <button class="btn primary block" onclick="location.reload()">${esc(t('Try again'))}</button></div></div>`;
  const up = cloudMode === 'up';
  return `<div class="login-bg"><div class="login-card">${langT}
   <h2>${esc(t(up ? 'Create the business account' : 'Sign in to SAN Ledger'))}</h2>
   <p class="muted">${esc(t('Use one account for the whole business. The owner and the cashier both sign in with it, then choose their role with a PIN.'))}</p>
   <form onsubmit="${act((e) => { e.preventDefault(); cloudSubmit(); })}">
    ${up ? `<label>${esc(t('Business name'))}</label><input id="c-name" autocomplete="organization">` : ''}
    <label>${esc(t('Email'))}</label><input id="c-email" type="email" autocomplete="username" required>
    <label>${esc(t('Password'))}</label><input id="c-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="8" required>
    <div class="form-error" id="c-err"></div>
    <button class="btn primary block" type="submit" id="c-btn">${esc(t(up ? 'Create account' : 'Sign in'))}</button>
   </form>
   <p class="muted sm center"><a href="?demo">${esc(t('Try the demo with sample data'))}</a></p>
   <p class="muted sm center">${up ? esc(t('Already have an account?')) : esc(t('First time?'))}
    <a href="#" onclick="${act((e) => { e.preventDefault(); cloudMode = up ? 'in' : 'up'; render(); })}">${esc(t(up ? 'Sign in' : 'Create account'))}</a></p>
  </div></div>`;
}
async function cloudSubmit() {
  const email = document.getElementById('c-email').value.trim(), pass = document.getElementById('c-pass').value;
  const err = document.getElementById('c-err'), btn = document.getElementById('c-btn');
  if (pass.length < 8) { err.textContent = t('Password must be at least 8 characters.'); return; }
  btn.disabled = true; err.textContent = '';
  try {
    const msg = cloudMode === 'up'
      ? await Cloud.signUp((document.getElementById('c-name') || {}).value, email, pass)
      : await Cloud.signIn(email, pass);
    if (msg) { err.textContent = msg; btn.disabled = false; }
    else if (cloudMode === 'up') { const n = (document.getElementById('c-name') || {}).value; if (n && !db.settings.business.name) { db.settings.business.name = n; saveDB(); } }
  } catch (e) { err.textContent = String(e.message || e); btn.disabled = false; }
}

document.addEventListener('DOMContentLoaded', () => Cloud.init());
