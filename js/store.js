/* SAN Ledger — data store (localStorage) */
const DB_KEY = 'sanledger.db.v1';

function defaultDB() {
  return {
    version: 1,
    settings: {
      lang: 'my',
      pins: { owner: '0000', cashier: '0000' },
      weightUnit: 'viss',           // 'viss' | 'lb'
      voucherSize: 'a5',            // 'a5' | '80mm'
      stockCheck: true,
      bagToBasket: 2,               // 1 bag of paddy = ? baskets
      business: { name: '', address: '', phone: '', type: 'mill' }, // mill | polisher
      varieties: ['ရွှေဘိုပေါ်ဆန်းမွှေး', 'ဧရာမင်း', 'မနောသုခ', 'ချင်းရွှေဝါ', 'ချင်းသုခ', 'ဘေးကြား'],
      paymentMethods: [
        { name: 'ငွေသား', cash: true },
        { name: 'KBZ Pay', cash: false },
        { name: 'KBZ Bank', cash: false },
        { name: 'Wave Pay', cash: false },
        { name: 'AYA Bank', cash: false },
        { name: 'CB Bank', cash: false },
      ],
      expenseCategories: ['မီတာခ', 'စက်သုံးဆီ', 'ပြုပြင်ထိန်းသိမ်းခ', 'အလုပ်သမားခ', 'အခြား'],
      outputs: {
        milling: [
          { name: 'ဆန်', desc: 'အဓိက ထွက်ရှိမှု', isDefault: true, bagViss: 30 },
          { name: 'ဆန်ကွဲ', desc: 'ခြောက်ထွက် တန်ဖိုးနည်း', isDefault: true, bagViss: 30 },
          { name: 'ဆန်လတ်', desc: 'အခြား အပိုထွက်', isDefault: true, bagViss: 30 },
          { name: 'ဆန်လတ်ကြီး', desc: 'ကြိတ်ခွဲမှ ထွက်ရှိသည့် အဓိက အပိုထွက်', isDefault: false, bagViss: 30 },
          { name: 'ဖွဲ', desc: 'ထွက်ရှိလာသောအမှုန့်', isDefault: true, bagViss: 20 },
        ],
        polishing: [
          { name: 'ဆန်', desc: 'ရွေးချပြီးရရှိသော အကောင်းဆန်', isDefault: true, bagViss: 30 },
          { name: 'ဆန်ကျော်', desc: 'ရှင်းလင်းမှုမှ ကျန်ရှိသော ဆန်', isDefault: true, bagViss: 30 },
          { name: 'ဆန်ညံ့', desc: 'အရည်အသွေး နိမ့် ဆန်အပိုထွက်', isDefault: true, bagViss: 30 },
          { name: 'ဆန်လတ်', desc: 'အောက်ခြေလတ် ဆန်အရည်အသွေး', isDefault: true, bagViss: 30 },
        ],
      },
    },
    counters: {},
    purchases: [], ricePurchases: [], receipts: [], riceReceipts: [],
    jobs: [], sales: [], deliveries: [], moves: [], payments: [],
    expenses: [], otherIncome: [], transportAdvances: [], salaryAdvances: [],
    drawers: [], audit: [],
  };
}

function migrate(d) {
  const def = defaultDB();
  for (const k in def) if (d[k] === undefined) d[k] = def[k];
  for (const k in def.settings) if (d.settings[k] === undefined) d.settings[k] = def.settings[k];
  return d;
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return defaultDB();
}

let db = loadDB();
/* Language is a per-device choice, not part of the shared books. */
const curLang = () => localStorage.getItem('sanledger.lang') || db.settings.lang || 'my';
/* Every change goes to the cloud (Cloud.saved also keeps a local copy for fast start-up). */
function saveDB() { if (typeof Cloud !== 'undefined' && Cloud.status === 'ready') Cloud.saved(); }

/* ---------- helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function peekNo(prefix) {
  const y = new Date().getFullYear(), key = prefix + '-' + y;
  return prefix + '-' + y + '-' + String((db.counters[key] || 0) + 1).padStart(3, '0');
}
function nextNo(prefix) {
  const y = new Date().getFullYear(), key = prefix + '-' + y;
  db.counters[key] = (db.counters[key] || 0) + 1;
  return prefix + '-' + y + '-' + String(db.counters[key]).padStart(3, '0');
}
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const monthOf = (date) => (date || '').slice(0, 7);
const thisMonth = () => today().slice(0, 7);
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const sum = (arr, f) => arr.reduce((a, x) => a + num(typeof f === 'function' ? f(x) : x[f]), 0);
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);

function isCashMethod(name) {
  const m = db.settings.paymentMethods.find((p) => p.name === name);
  return m ? !!m.cash : false;
}
const cashMethodName = () => (db.settings.paymentMethods.find((p) => p.cash) || db.settings.paymentMethods[0] || { name: '' }).name;

/* ---------- audit ---------- */
function audit(type, action, detail, severity = 'info') {
  db.audit.unshift({ id: uid(), at: new Date().toISOString(), role: Session.role, type, action, detail, severity });
  if (db.audit.length > 3000) db.audit.length = 3000;
}

/* ---------- money ledger ----------
 payment: {id,date,dir:'in'|'out',amount,method,source,refId,party,note} */
function addPayment(p) {
  if (!num(p.amount)) return null;
  const rec = { id: uid(), date: p.date || today(), dir: p.dir, amount: num(p.amount), method: p.method || cashMethodName(), source: p.source, refId: p.refId || '', party: p.party || '', note: p.note || '' };
  db.payments.push(rec);
  return rec;
}
function removePaymentsFor(refId) { db.payments = db.payments.filter((p) => p.refId !== refId && p.refId !== refId + ':t'); }
const paymentsFor = (refId) => db.payments.filter((p) => p.refId === refId);

/* ---------- stock ledger ----------
 move: {id,date,kind:'paddy'|'rice'|'milling'|'polishing', item, owner:'mill'|'customer', ownerName, qty, viss, ref, refId, note}
 qty = baskets for paddy, bags for everything else (signed) */
function addMove(m) {
  const rec = { id: uid(), date: m.date || today(), kind: m.kind, item: m.item, owner: m.owner || 'mill', ownerName: m.owner === 'customer' ? (m.ownerName || '') : '', qty: num(m.qty), viss: num(m.viss), ref: m.ref || '', refId: m.refId || '', note: m.note || '' };
  db.moves.push(rec);
  return rec;
}
function removeMovesFor(refId) { db.moves = db.moves.filter((m) => m.refId !== refId); }

function stockBalances(filter = {}) {
  const map = {};
  for (const m of db.moves) {
    if (filter.kind && m.kind !== filter.kind) continue;
    if (filter.owner && m.owner !== filter.owner) continue;
    const key = [m.kind, m.item, m.owner, m.ownerName].join('|');
    if (!map[key]) map[key] = { kind: m.kind, item: m.item, owner: m.owner, ownerName: m.ownerName, qty: 0, viss: 0 };
    map[key].qty += m.qty; map[key].viss += m.viss;
  }
  return Object.values(map).filter((r) => Math.abs(r.qty) > 1e-9 || Math.abs(r.viss) > 1e-9);
}
function stockOf(kind, item, owner, ownerName = '') {
  return db.moves.filter((m) => m.kind === kind && m.item === item && m.owner === owner && (owner !== 'customer' || m.ownerName === ownerName))
    .reduce((a, m) => a + m.qty, 0);
}

/* ---------- cash drawer ---------- */
function drawerFor(date) { return db.drawers.find((d) => d.date === date); }
function cashFlowsOn(date) {
  return db.payments.filter((p) => p.date === date && isCashMethod(p.method));
}
function drawerSummary(date) {
  const d = drawerFor(date);
  const flows = cashFlowsOn(date);
  const cin = sum(flows.filter((p) => p.dir === 'in'), 'amount');
  const cout = sum(flows.filter((p) => p.dir === 'out'), 'amount');
  const opening = d ? num(d.opening) : 0;
  const topups = d ? sum(d.topups || [], 'amount') : 0;
  return { drawer: d, opening, topups, cin, cout, expected: opening + topups + cin - cout, actual: d && d.closed ? num(d.actual) : null, flows };
}

/* ---------- session ---------- */
const Session = {
  get role() { return sessionStorage.getItem('sanledger.role') || ''; },
  set role(v) { v ? sessionStorage.setItem('sanledger.role', v) : sessionStorage.removeItem('sanledger.role'); },
  get isOwner() { return this.role === 'owner'; },
};
