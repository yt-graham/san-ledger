/* SAN Ledger — demo mode (open the site with ?demo).
   Fills the app with sample records so people can try every page. Nothing is sent to the server
   and everything resets when the page is reloaded. */
const isDemo = () => new URLSearchParams(location.search).has('demo');

function demoDB() {
  db = defaultDB();
  const V = db.settings.varieties, M = 'ငွေသား', K = 'KBZ Pay';
  const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const tm = (h) => String(8 + (h % 9)).padStart(2, '0') + ':' + String((h * 17) % 60).padStart(2, '0');
  let h = 0;

  // Paddy purchases (mill stock)
  [[80, 'ဦးအောင်မြင့်', 0, 300, 8200], [62, 'ချင်းတွင်းကုမ္ပဏီ', 1, 240, 8500], [35, 'ဒေါ်ခင်လှ', 0, 200, 8300], [6, 'ဦးကျော်ဇင်', 2, 160, 8600]].forEach(([n, seller, vi, baskets, price], i) => {
    const total = baskets * price + 30000;
    const r = { id: uid(), no: nextNo('PUR'), date: ago(n), time: tm(h++), seller, transporter: 'ကိုမောင်', variety: V[vi], baskets, bags: baskets / 2, price, transport: 30000, transportSeparate: false, extra: 30000, total, note: '' };
    db.purchases.push(r);
    addMove({ date: r.date, kind: 'paddy', item: r.variety, owner: 'mill', qty: baskets, ref: r.no, refId: r.id, note: t('Purchase') + ' — ' + seller });
    addPayment({ date: r.date, dir: 'out', amount: i === 3 ? 500000 : total, method: i % 2 ? K : M, source: 'paddy-purchase', refId: r.id, party: seller });
  });
  // Rice purchase
  { const r = { id: uid(), no: nextNo('RPU'), date: ago(20), time: tm(h++), seller: 'ရွှေဆန်ကုန်သည်', transporter: '', product: V[1], bags: 40, viss: 1200, price: 62000, transport: 0, extra: 0, total: 2480000, note: '' };
    db.ricePurchases.push(r);
    addMove({ date: r.date, kind: 'rice', item: r.product, owner: 'mill', qty: 40, viss: 1200, ref: r.no, refId: r.id, note: t('Purchase') });
    addPayment({ date: r.date, dir: 'out', amount: r.total, method: K, source: 'rice-purchase', refId: r.id, party: r.seller }); }
  // Customer paddy receipts
  const rec = [[45, 'ဦးဘ', 1, 120, 25000], [12, 'ဒေါ်မြ', 0, 90, 0], [3, 'ဦးလှထွန်း', 3, 70, 20000]].map(([n, customer, vi, baskets, ta]) => {
    const r = { id: uid(), no: nextNo('REC'), date: ago(n), time: tm(h++), customer, transporter: 'ကိုသန်း', vehicle: 'ကိုသန်း', variety: V[vi], baskets, bags: baskets / 2, transport: ta, note: '' };
    db.receipts.push(r);
    addMove({ date: r.date, kind: 'paddy', item: r.variety, owner: 'customer', ownerName: customer, qty: baskets, ref: r.no, refId: r.id, note: t('Customer deposit') });
    if (ta) { const a = { id: uid(), no: nextNo('TA'), type: 'transport', date: r.date, customer, amount: ta, receiptId: r.id, receiptNo: r.no, vehicle: r.transporter, note: '' };
      db.transportAdvances.push(a); addPayment({ date: r.date, dir: 'out', amount: ta, method: M, source: 'transport-advance', refId: a.id, party: customer, note: r.no }); }
    return r;
  });
  addPayment({ date: ago(30), dir: 'in', amount: 25000, method: M, source: 'transport-repay', refId: db.transportAdvances[0].id, party: 'ဦးဘ' });

  // Jobs
  const job = (n, type, source, item, qty, extra) => {
    const j = { id: uid(), no: nextNo('JOB'), date: ago(n), time: tm(h++), type, source, inputKind: 'paddy', qty, fee: 0, note: '', status: 'received', outputs: [], history: [{ status: 'received', at: ago(n) }], customer: '', item, ...extra };
    const owner = source === 'deposit' ? 'customer' : 'mill';
    addMove({ date: j.date, kind: 'paddy', item, owner, ownerName: j.customer, qty: -qty, ref: j.no, refId: j.id, note: t('Used in job') });
    db.jobs.push(j); return j;
  };
  const outputs = (j, list) => { j.outputs = list.map(([product, bags]) => ({ product, bags, viss: bags * bagVissFor(product) }));
    j.outputs.forEach((o) => addMove({ date: j.date, kind: 'milling', item: o.product, owner: jobOwner(j), ownerName: j.customer, qty: o.bags, viss: o.viss, ref: j.no, refId: j.id, note: 'output' })); };
  const status = (j, list) => list.forEach((s) => { j.status = s; j.history.push({ status: s, at: j.date }); });
  const O = db.settings.outputs.milling.map((o) => o.name);
  const j1 = job(78, 'milling', 'purchase', V[0], 280); outputs(j1, [[O[0], 120], [O[1], 18], [O[2], 10], [O[4], 30]]); status(j1, ['drying', 'milling', 'settled', 'collected']);
  const j2 = job(58, 'milling', 'purchase', V[1], 220); outputs(j2, [[O[0], 95], [O[1], 14], [O[4], 24]]); status(j2, ['drying', 'milling', 'settled', 'collected']);
  const j3 = job(40, 'milling', 'deposit', V[1], 120, { customer: 'ဦးဘ', receiptId: rec[0].id, receiptNo: rec[0].no, fee: 180000 });
  outputs(j3, [[O[0], 52], [O[1], 8], [O[4], 12]]); status(j3, ['drying', 'milling', 'settled', 'collected']);
  addPayment({ date: ago(38), dir: 'in', amount: 120000, method: M, source: 'job-fee', refId: j3.id, party: 'ဦးဘ' });
  { const d = { id: uid(), no: nextNo('DO'), date: ago(38), type: 'job', refId: j3.id, refNo: j3.no, name: 'ဦးဘ', items: j3.outputs.map((o) => ({ item: o.product, kind: 'milling', bags: o.bags, viss: o.viss })), vehicle: 'ကိုသန်း', note: '' };
    db.deliveries.push(d); d.items.forEach((it) => addMove({ date: d.date, kind: 'milling', item: it.item, owner: 'customer', ownerName: 'ဦးဘ', qty: -it.bags, viss: -it.viss, ref: d.no, refId: j3.id, note: t('Collected by customer') })); }
  const j4 = job(10, 'milling', 'deposit', V[0], 90, { customer: 'ဒေါ်မြ', receiptId: rec[1].id, receiptNo: rec[1].no, fee: 135000 }); status(j4, ['drying', 'milling']);
  const j5 = job(4, 'milling', 'purchase', V[0], 120); status(j5, ['drying']);
  job(1, 'milling', 'deposit', V[3], 70, { customer: 'ဦးလှထွန်း', receiptId: rec[2].id, receiptNo: rec[2].no, fee: 105000 });

  // Sales
  const sale = (n, customer, lines, paid, method, deliver, due) => {
    const items = lines.map(([kind, item, bags, price]) => ({ kind, item, bags, viss: bags * bagVissFor(item), price, amount: bags * price }));
    const x = { id: uid(), no: nextNo('SAL'), date: ago(n), time: tm(h++), customer, items, discount: 0, total: sum(items, 'amount'), dueDate: due ? ago(-due) : '', note: '' };
    db.sales.push(x); addPayment({ date: x.date, dir: 'in', amount: paid === true ? x.total : paid, method, source: 'sale', refId: x.id, party: customer });
    if (deliver) createSaleDelivery(x, items.map((it, idx) => ({ idx, bags: it.bags })), { date: x.date });
  };
  sale(70, 'ရွှေမန္တလာ ဆန်ဆိုင်', [['milling', O[0], 60, 64000], ['milling', O[4], 20, 9000]], true, K, true);
  sale(50, 'ဒေါ်စန်းစန်း', [['milling', O[0], 40, 65000]], true, M, true);
  sale(25, 'ရွှေမန္တလာ ဆန်ဆိုင်', [['milling', O[0], 50, 66000], ['milling', O[1], 15, 38000]], 2000000, K, true, -5);
  sale(8, 'ဦးတင်ဝင်း', [['rice', V[1], 20, 70000]], 0, M, false, 14);
  sale(2, 'ဒေါ်စန်းစန်း', [['milling', O[0], 30, 67000], ['other', 'ဆန်အိတ်အဟောင်း', 100, 500]], true, M, true);

  // Expenses, other income, salary advances
  const C = db.settings.expenseCategories;
  [[75, C[0], 450000, 'လျှပ်စစ်မီတာခ'], [60, C[1], 380000, 'ဒီဇယ်'], [45, C[3], 900000, 'လုပ်ခ'], [30, C[0], 470000, 'လျှပ်စစ်မီတာခ'], [18, C[2], 250000, 'ဘယ်ယာရင် လဲ'], [5, C[1], 410000, 'ဒီဇယ်']].forEach(([n, category, amount, desc], i) => {
    const e = { id: uid(), no: nextNo('EXP'), date: ago(n), time: tm(h++), category, desc, payee: '', ref: '', note: '', amount };
    db.expenses.push(e); addPayment({ date: e.date, dir: 'out', amount: i === 5 ? 200000 : amount, method: M, source: 'expense', refId: e.id, note: category });
  });
  [[55, 'ဖွဲရောင်းရငွေ', 180000], [15, 'ဆန်အိတ်အဟောင်း', 60000]].forEach(([n, source, amount]) => {
    const e = { id: uid(), no: nextNo('OIN'), date: ago(n), time: tm(h++), source, ref: '', desc: source, payer: '', amount, method: M, note: '' };
    db.otherIncome.push(e); addPayment({ date: e.date, dir: 'in', amount, method: M, source: 'other-income', refId: e.id, party: source });
  });
  { const a = { id: uid(), no: nextNo('ADV'), date: ago(9), time: tm(h++), employee: 'ကိုအောင်ကို', position: 'W-03', amount: 150000, reason: 'မိသားစုကိစ္စ', note: '' };
    db.salaryAdvances.push(a); addPayment({ date: a.date, dir: 'out', amount: a.amount, method: M, source: 'salary-advance', refId: a.id, party: a.employee }); }

  // Today's cash drawer
  db.drawers.push({ id: uid(), date: today(), opening: 1500000, topups: [], closed: false, note: '' });
  db.settings.business = { name: 'SAN Rice Mill (Demo)', address: 'Demo', phone: '09 000 000 000', type: 'mill' };
  db.audit = [];
  return db;
}
