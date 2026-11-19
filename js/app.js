/* SAN Ledger — shell, router, login */
const ic = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = {
  dashboard: ic('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
  cash: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  basket: ic('<path d="M3 10h18l-2 10H5L3 10z"/><path d="M8 10l4-6 4 6"/>'),
  bag: ic('<path d="M6 7h12l1 14H5L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>'),
  clipboard: ic('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
  book: ic('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M9 9l2 2 4-4"/>'),
  wheat: ic('<path d="M12 22V8"/><path d="M12 8c-3 0-4-3-4-5 2 0 4 1 4 5zM12 8c3 0 4-3 4-5-2 0-4 1-4 5zM12 13c-3 0-4-3-4-5 2 0 4 1 4 5zM12 13c3 0 4-3 4-5-2 0-4 1-4 5z"/>'),
  coin: ic('<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>'),
  truck: ic('<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
  box: ic('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
  receipt: ic('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>'),
  plus: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  car: ic('<path d="M5 17h14v-5l-2-5H7l-2 5v5z"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>'),
  user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  chart: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  log: ic('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  save: ic('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>'),
  check: ic('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'),
};

const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard', owner: true, render: () => pageDashboard() },
  { path: 'cash-drawer', label: 'Cash Drawer', icon: 'cash', render: () => pageCashDrawer() },
  { path: 'purchases', label: 'Paddy Purchases', icon: 'basket', render: () => pagePurchases('paddy') },
  { path: 'rice-purchases', label: 'Rice Purchases', icon: 'bag', render: () => pagePurchases('rice') },
  { path: 'receipts', label: 'Paddy Receipts', icon: 'clipboard', render: () => pageReceipts('paddy') },
  { path: 'rice-receipts', label: 'Rice Receipts', icon: 'book', render: () => pageReceipts('rice') },
  { path: 'jobs', label: 'Jobs', icon: 'wheat', render: () => pageJobs() },
  { path: 'sales', label: 'Sales', icon: 'coin', render: () => pageSales() },
  { path: 'delivery-orders', label: 'Delivery Orders', icon: 'truck', render: () => pageDeliveries() },
  { path: 'inventory', label: 'Inventory', icon: 'box', render: () => pageInventory() },
  { path: 'expenses', label: 'Expenses', icon: 'receipt', render: () => pageExpenses() },
  { path: 'other-income', label: 'Other Income', icon: 'plus', render: () => pageOtherIncome() },
  { path: 'transport-advances', label: 'Transport Advances', icon: 'car', render: () => pageTransportAdvances() },
  { path: 'salary-advances', label: 'Salary Advances', icon: 'user', render: () => pageSalaryAdvances() },
  { path: 'reports', label: 'Reports', icon: 'chart', render: () => pageReports() },
  { path: 'audit-logs', label: 'Audit Logs', icon: 'log', render: () => pageAudit() },
  { path: 'settings', label: 'Settings', icon: 'gear', render: () => pageSettings() },
  { path: 'backup-restore', label: 'Backup / Restore', icon: 'save', owner: true, render: () => pageBackup() },
  { path: 'guides', label: 'User Guide', icon: 'help', render: () => pageGuides() },
];

/* page-level UI state (filters etc.) survives re-render */
const UI = {};
const ui = (page) => (UI[page] = UI[page] || {});

function currentPath() { return (location.hash.replace(/^#\/?/, '') || '').split('?')[0]; }
function go(path) { location.hash = '#/' + path; }

function render() {
  resetActs();
  document.documentElement.lang = curLang() === 'my' ? 'my' : 'en';
  document.title = 'SAN Ledger - ' + t('Rice Mill Management System');
  const app = document.getElementById('app');
  if (Cloud.status !== 'ready') { app.innerHTML = cloudScreenHTML(); return; }
  if (!Session.role) { app.innerHTML = loginHTML(); return; }
  let path = currentPath();
  let route = ROUTES.find((r) => r.path === path);
  if (!route || (route.owner && !Session.isOwner)) {
    route = Session.isOwner ? ROUTES[0] : ROUTES[1];
    if (path !== route.path) { history.replaceState(null, '', '#/' + route.path); }
  }
  let body;
  try { body = route.render(); } catch (e) { console.error(e); body = `<div class="card"><h3>Error</h3><pre>${esc(e.stack || e)}</pre></div>`; }
  app.innerHTML = shellHTML(route, body);
  const v = document.querySelector('.content'); if (v && UI._scrollTo === route.path) { /* keep */ }
}

function shellHTML(route, body) {
  const b = db.settings.business;
  const nav = ROUTES.filter((r) => !r.owner || Session.isOwner).map((r) =>
    `<a href="#/${r.path}" class="${r === route ? 'active' : ''}" onclick="document.body.classList.remove('nav-open')">${ICONS[r.icon]}<span>${esc(t(r.label))}</span></a>`).join('');
  return `<div class="shell">
  <aside class="sidebar"><div class="brand"><div class="brand-name">SAN Ledger <span class="ver">v1.0</span></div><div class="brand-sub">${esc(b.name || t('Rice Mill Management System'))}</div></div>
   <nav>${nav}</nav></aside>
  <div class="nav-scrim" onclick="document.body.classList.remove('nav-open')"></div>
  <div class="main">
   <header class="topbar">
    <button class="icon-btn menu-btn" onclick="document.body.classList.toggle('nav-open')">☰</button>
    <div class="top-title">${esc(t('Rice Mill Management System'))}</div>
    <div class="top-actions">
     ${syncPillHTML()}
     <span class="pill">${esc(Session.isOwner ? t('Owner') : t('Cashier'))}</span>
     <div class="lang-toggle"><button class="${curLang() === 'en' ? 'on' : ''}" onclick="${act(() => setLang('en'))}">EN</button><button class="${curLang() === 'my' ? 'on' : ''}" onclick="${act(() => setLang('my'))}">မြန်မာ</button></div>
     <a class="btn ghost sm hide-sm" href="#/guides">${esc(t('Read the user guide'))}</a>
     <button class="avatar" title="${esc(t('Business profile'))}" onclick="${act(openProfile)}">${esc(initials(b.name))}</button>
     <button class="btn ghost sm" onclick="${act(logout)}">${esc(t('Log out'))}</button>
    </div>
   </header>
   <main class="content">${body}</main>
  </div></div>`;
}
const initials = (name) => (name || 'SAN').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function setLang(l) { localStorage.setItem('sanledger.lang', l); render(); }

function openProfile() {
  const b = db.settings.business;
  formModal({
    title: t('Business profile'),
    fields: [
      { k: 'name', label: t('Business name'), full: true },
      { k: 'address', label: t('Address'), full: true },
      { k: 'phone', label: t('Phone numbers') },
      { k: 'type', label: t('Business type'), type: 'select', placeholder: false, options: [{ v: 'mill', l: t('Rice mill') }, { v: 'polisher', l: t('Rice polishing mill') }] },
    ],
    values: b,
    onSubmit: (v) => {
      if (!Session.isOwner) return t('Only the owner account can do this.');
      Object.assign(db.settings.business, v); audit('settings', 'update', t('Business profile')); toast(t('Saved'));
    },
  });
}

/* ---------- login ---------- */
let loginRole = '';
function loginHTML() {
  return `<div class="login-bg"><div class="login-card">
   <div class="lang-toggle center"><button class="${curLang() === 'en' ? 'on' : ''}" onclick="${act(() => setLang('en'))}">English</button><button class="${curLang() === 'my' ? 'on' : ''}" onclick="${act(() => setLang('my'))}">မြန်မာ</button></div>
   <h2>${esc(t('Choose a user type'))}</h2>
   <p class="muted">${esc(t('Enter the PIN for the account type you choose. The default owner PIN is 0000 and the default cashier PIN is 0000. PINs can be changed on the Settings page.'))}</p>
   <div class="role-grid">
    ${['owner', 'cashier'].map((r) => `<button class="role ${loginRole === r ? 'on' : ''}" onclick="${act(() => { loginRole = r; render(); setTimeout(() => document.getElementById('pin')?.focus(), 0); })}">
      <div class="role-tag">${r.toUpperCase()}</div><div class="role-name">${esc(t(r === 'owner' ? 'Owner account' : 'Cashier account'))}</div>
      <div class="role-desc">${esc(t(r === 'owner' ? 'Can also view business overview and reports.' : 'Can use daily operations only.'))}</div></button>`).join('')}
   </div>
   <form onsubmit="${act((e) => { e.preventDefault(); doLogin(); })}">
    <label>${esc(loginRole ? t('PIN') : t('Choose an account type before entering the PIN'))}</label>
    <input id="pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" ${loginRole ? '' : 'disabled'} autocomplete="off">
    <div class="form-error" id="login-err"></div>
    <button class="btn primary block" type="submit" ${loginRole ? '' : 'disabled'}>${esc(t('Open'))}</button>
   </form>
   <p class="muted sm center">${esc(t('Signed in as'))} <b>${esc(Cloud.user ? Cloud.user.email : '')}</b> ·
    <a href="#" onclick="${act((e) => { e.preventDefault(); confirmBox(t('Sign out of the business account on this device?'), () => Cloud.signOut()); })}">${esc(t('Sign out of account'))}</a></p>
  </div></div>`;
}
function doLogin() {
  const pin = document.getElementById('pin').value;
  if (pin === db.settings.pins[loginRole]) {
    Session.role = loginRole; audit('auth', 'login', t(loginRole === 'owner' ? 'Owner' : 'Cashier')); saveDB();
    loginRole = ''; go(Session.isOwner ? 'dashboard' : 'cash-drawer'); render();
  } else {
    document.getElementById('login-err').textContent = t('Incorrect PIN');
    document.getElementById('pin').value = '';
  }
}
function logout() { audit('auth', 'logout', ''); saveDB(); Session.role = ''; render(); }

window.addEventListener('hashchange', render);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('DOMContentLoaded', render);
