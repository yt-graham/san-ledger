/* SAN Ledger — dashboard, reports, audit, settings, backup, guides */

/* =================== DASHBOARD =================== */
function pageDashboard() {
  const inProg = db.jobs.filter((j) => !['settled', 'collected'].includes(j.status));
  const m = thisMonth();
  const monPays = db.payments.filter((p) => monthOf(p.date) === m);
  const pin = sum(monPays.filter((p) => p.dir === 'in'), 'amount');
  const pout = sum(monPays.filter((p) => p.dir === 'out'), 'amount');
  const months = lastMonths(6);
  const labels = months.map(monthLabel);
  const byMonth = (arr, dateF, valF) => months.map((mm) => sum(arr.filter((x) => monthOf(dateF(x)) === mm), valF));
  const chart1 = barChart(labels, [
    { name: t('Expenses'), color: '#c0392b', values: byMonth(db.expenses, (e) => e.date, 'amount') },
    { name: t('Service fee income'), color: '#1f7a5a', values: byMonth(db.payments.filter((p) => p.source === 'job-fee'), (p) => p.date, 'amount') },
    { name: t('Sales revenue'), color: '#3366cc', values: byMonth(db.sales, (s) => s.date, 'total') },
  ]);
  const chart2 = barChart(labels, [
    { name: t('Milling output (bags)'), color: '#1f7a5a', values: byMonth(db.jobs.filter((j) => j.type === 'milling'), (j) => j.date, (j) => sum(j.outputs || [], 'bags')) },
    { name: t('Paddy received (baskets)'), color: '#e07b2a', values: months.map((mm) => sum(db.receipts.filter((r) => monthOf(r.date) === mm), 'baskets') + sum(db.purchases.filter((r) => monthOf(r.date) === mm), 'baskets')) },
  ]);
  const st = ['drying', 'milling', 'polishing', 'collected'];
  const chart3 = barChart(st.map((x) => t(STATUS_LABEL[x])), [{ name: t('Count'), color: '#3366cc', values: st.map((x) => db.jobs.filter((j) => j.status === x).length) }]);
  const buckets = [[0, 30], [31, 60], [61, 90], [91, 1e9]];
  const recv = receivables();
  const cats = [['transport', 'Transport advance', '#e07b2a'], ['sale', 'Sales credit', '#3366cc'], ['salary', 'Salary advance', '#8e44ad'], ['job', 'Service fee', '#1f7a5a']];
  const chart4 = barChart(['0-30 ' + t('days'), '31-60 ' + t('days'), '61-90 ' + t('days'), '90+ ' + t('days')],
    cats.map(([k, l, c]) => ({ name: t(l), color: c, values: buckets.map(([a, b]) => sum(recv.filter((r) => r.cat === k && r.days >= a && r.days <= b), 'due')) })));
  return pageHead(t('Business overview'), '') +
   `<div class="stats">
    ${statCard(t('Total jobs'), nf(db.jobs.length), '', ICONS.box)}
    ${statCard(t('In progress'), nf(inProg.length), '', ICONS.wheat)}
    ${statCard(t('Settled'), nf(db.jobs.filter((j) => j.status === 'settled').length), '', ICONS.check)}
    ${statCard(t('Collected'), nf(db.jobs.filter((j) => j.status === 'collected').length), '', ICONS.truck)}
    ${statCard(t('Net income this month'), money(pin - pout), t('Income') + ' ' + money(pin) + ' | ' + t('Spending') + ' ' + money(pout), ICONS.coin, pin - pout < 0 ? 'warn' : '')}
   </div>
   <div class="grid-2col">
    <div class="card"><h3>${t('Monthly sales and expenses')}</h3>${chart1}</div>
    <div class="card"><h3>${t('Monthly paddy received and milling output')}</h3>${chart2}</div>
    <div class="card"><h3>${t('Job statuses')}</h3>${chart3}</div>
    <div class="card"><h3>${t('Money to receive')}</h3>${chart4}</div>
   </div>`;
}

function receivables() {
  const t0 = today(); const out = [];
  db.sales.forEach((s) => { const d = saleDue(s); if (d > 0.5) out.push({ cat: 'sale', type: 'Sales credit', party: s.customer, ref: s.no, date: s.date, dueDate: s.dueDate, due: d, days: daysBetween(s.date, t0) }); });
  db.jobs.forEach((j) => { const d = num(j.fee) - jobFeePaid(j); if (j.source === 'deposit' && d > 0.5 && ['settled', 'collected'].includes(j.status)) out.push({ cat: 'job', type: 'Service fee', party: j.customer, ref: j.no, date: j.date, due: d, days: daysBetween(j.date, t0) }); });
  db.transportAdvances.forEach((a) => { const d = taRemain(a); if (d > 0.5) out.push({ cat: 'transport', type: a.type === 'cash' ? 'Cash advance' : 'Transport advance', party: a.customer, ref: a.no, date: a.date, due: d, days: daysBetween(a.date, t0) }); });
  db.salaryAdvances.forEach((a) => { const d = saRemain(a); if (d > 0.5) out.push({ cat: 'salary', type: 'Salary advance', party: a.employee, ref: a.no, date: a.date, due: d, days: daysBetween(a.date, t0) }); });
  return out;
}
function payables() {
  const t0 = today(); const out = [];
  db.purchases.forEach((p) => { const d = p.total - paidOut(p.id); if (d > 0.5) out.push({ type: 'Paddy purchase', party: p.seller, ref: p.no, date: p.date, due: d, days: daysBetween(p.date, t0) }); });
  db.ricePurchases.forEach((p) => { const d = p.total - paidOut(p.id); if (d > 0.5) out.push({ type: 'Rice purchase', party: p.seller, ref: p.no, date: p.date, due: d, days: daysBetween(p.date, t0) }); });
  db.expenses.forEach((e) => { const d = e.amount - paidOut(e.id); if (d > 0.5) out.push({ type: 'Expense', party: e.payee || e.category, ref: e.no, date: e.date, due: d, days: daysBetween(e.date, t0) }); });
  return out;
}

/* =================== REPORTS =================== */
const REPORTS = [
  ['cash', 'Cash drawer report', 'Daily cash in and out from the cash drawer'],
  ['ie', 'Income / expense report', 'Income and spending by account and category', true],
  ['pl', 'Profit / loss report', 'Summary of income, spending and profit/loss by category', true],
  ['stock', 'Stock report', 'Stock by ownership and type'],
  ['ops', 'Daily operations', 'Daily drying, milling and polishing work with output details'],
  ['recv', 'Receivables', 'Balances customers have not paid yet'],
  ['pay', 'Payables', 'Balances owed to sellers and service providers'],
  ['moves', 'Stock movement report', 'Stock in/out movements by date and type'],
];
const visibleReports = () => REPORTS.filter((r) => !r[3] || Session.isOwner);
function pageReports() {
  const s = ui('rep');
  if (s.report && !visibleReports().some((r) => r[0] === s.report)) s.report = '';
  if (!s.report) {
    return pageHead(t('Reports'), t('Choose finance, stock and receivable/payable reports to view in detail.')) +
     `<div class="report-grid">${visibleReports().map(([k, l, d]) => `<div class="card report-card"><h3>${esc(t(l))}</h3><p class="muted">${esc(t(d))}</p>${btn(t('View'), act(() => { s.report = k; render(); }))}</div>`).join('')}</div>`;
  }
  s.from = s.from || thisMonth() + '-01'; s.to = s.to || today();
  const def = REPORTS.find((r) => r[0] === s.report);
  const rep = buildReport(s.report, s.from, s.to, s);
  const noRange = ['stock', 'recv', 'pay'].includes(s.report);
  return pageHead(t(def[1]), t(def[2]), btn('← ' + t('All reports'), act(() => { s.report = ''; render(); }), 'ghost') +
     btn(t('Print'), act(() => printHTML(t(def[1]), `<h3 class="c">${esc(t(def[1]))}</h3>${noRange ? '' : `<p class="c m">${s.from} – ${s.to}</p>`}${rep.printHTML || ''}`)), 'ghost') +
     btn(t('Export CSV'), act(() => downloadFile(s.report + '-' + today() + '.csv', toCSV(rep.cols, rep.rows), 'text/csv')), 'ghost')) +
   (noRange ? '' : `<div class="card"><div class="filters"><span class="muted">${t('From')}</span><input type="date" value="${s.from}" onchange="${act((e) => { s.from = e.target.value; render(); })}"><span class="muted">${t('To')}</span><input type="date" value="${s.to}" onchange="${act((e) => { s.to = e.target.value; render(); })}"></div></div>`) +
   (rep.summary ? `<div class="stats">${rep.summary}</div>` : '') +
   `<div class="card">${table(rep.cols, rep.rows, { foot: rep.foot, empty: t('No data for this period.') })}</div>`;
}
function simpleTableHTML(cols, rows, foot) {
  return `<table><tr>${cols.map((c) => `<th class="${c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'n' : ''}">${esc(c.csv ? c.csv(r) : c.v(r))}</td>`).join('')}</tr>`).join('')}${foot ? `<tr class="tot">${foot.map((f) => `<td class="n">${f}</td>`).join('')}</tr>` : ''}</table>`;
}
function buildReport(k, from, to, s) {
  const inRange = (d) => d >= from && d <= to;
  let cols = [], rows = [], foot = null, summary = '';
  if (k === 'cash') {
    rows = db.drawers.filter((d) => inRange(d.date)).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ d, s: drawerSummary(d.date) }));
    cols = [{ label: t('Date'), v: (r) => r.d.date }, { label: t('Opening cash'), num: true, v: (r) => nf(r.s.opening) }, { label: t('Top-up cash'), num: true, v: (r) => nf(r.s.topups) },
      { label: t('Cash in'), num: true, v: (r) => nf(r.s.cin) }, { label: t('Cash out'), num: true, v: (r) => nf(r.s.cout) }, { label: t('Expected balance'), num: true, v: (r) => nf(r.s.expected) },
      { label: t('Actual balance'), num: true, v: (r) => r.s.actual === null ? '—' : nf(r.s.actual) }, { label: t('Difference'), num: true, v: (r) => r.s.actual === null ? '—' : nf(r.s.actual - r.s.expected) }];
    foot = ['', '', nf(sum(rows, (r) => r.s.topups)), nf(sum(rows, (r) => r.s.cin)), nf(sum(rows, (r) => r.s.cout)), '', '', ''];
  } else if (k === 'ie') {
    const g = {};
    db.payments.filter((p) => inRange(p.date)).forEach((p) => { const key = p.dir + '|' + p.source + '|' + p.method; g[key] = (g[key] || 0) + p.amount; });
    rows = Object.entries(g).map(([key, amt]) => { const [dir, src, method] = key.split('|'); return { dir, src, method, amt }; }).sort((a, b) => a.dir.localeCompare(b.dir) || b.amt - a.amt);
    cols = [{ label: t('Type'), v: (r) => r.dir === 'in' ? t('Income') : t('Spending') }, { label: t('Category'), v: (r) => t(SOURCE_NAMES[r.src] || r.src) }, { label: t('Account'), v: (r) => r.method }, { label: t('Amount'), num: true, v: (r) => nf(r.amt) }];
    const tin = sum(rows.filter((r) => r.dir === 'in'), 'amt'), tout = sum(rows.filter((r) => r.dir === 'out'), 'amt');
    summary = statCard(t('Income'), money(tin), '', '', 'pos') + statCard(t('Spending'), money(tout), '', '', 'negc') + statCard(t('Net'), money(tin - tout));
  } else if (k === 'pl') {
    const sales = sum(db.sales.filter((x) => inRange(x.date)), 'total');
    const fees = sum(db.jobs.filter((j) => j.source === 'deposit' && inRange(j.date)), 'fee');
    const oi = sum(db.otherIncome.filter((x) => inRange(x.date)), 'amount');
    const pp = sum(db.purchases.filter((x) => inRange(x.date)), 'total');
    const rp = sum(db.ricePurchases.filter((x) => inRange(x.date)), 'total');
    const ex = db.expenses.filter((x) => inRange(x.date));
    rows = [
      { g: t('Income'), c: t('Sales revenue'), a: sales }, { g: t('Income'), c: t('Service fee income'), a: fees }, { g: t('Income'), c: t('Other income'), a: oi },
      { g: t('Spending'), c: t('Paddy purchase'), a: -pp }, { g: t('Spending'), c: t('Rice purchase'), a: -rp },
      ...db.settings.expenseCategories.map((c) => ({ g: t('Spending'), c: t('Expense') + ' · ' + c, a: -sum(ex.filter((e) => e.category === c), 'amount') })),
    ].filter((r) => r.a);
    cols = [{ label: t('Group'), v: (r) => r.g }, { label: t('Category'), v: (r) => r.c }, { label: t('Amount'), num: true, v: (r) => nf(r.a) }];
    const inc = sales + fees + oi, cost = pp + rp + sum(ex, 'amount');
    foot = ['', t('Profit / loss'), nf(inc - cost)];
    summary = statCard(t('Income'), money(inc), '', '', 'pos') + statCard(t('Spending'), money(cost), '', '', 'negc') + statCard(t('Profit / loss'), money(inc - cost), '', '', inc - cost < 0 ? 'warn' : '');
  } else if (k === 'stock') {
    rows = stockBalances().sort((a, b) => a.kind.localeCompare(b.kind) || a.owner.localeCompare(b.owner) || a.item.localeCompare(b.item));
    cols = [{ label: t('Type'), v: (r) => t(KIND_LABEL[r.kind]) }, { label: t('Owner'), v: (r) => r.owner === 'mill' ? t('Mill') : r.ownerName }, { label: t('Item'), v: (r) => r.item },
      { label: t('Quantity'), num: true, v: (r) => nf(r.qty) + ' ' + unitFor(r.kind) }, { label: t('Weight'), num: true, v: (r) => r.kind === 'paddy' ? '—' : weight(r.viss) }];
  } else if (k === 'ops') {
    rows = db.jobs.filter((j) => inRange(j.date)).sort((a, b) => a.date.localeCompare(b.date));
    cols = [{ label: t('Date'), v: (j) => j.date }, { label: t('Job no.'), v: (j) => j.no }, { label: t('Job type'), v: (j) => t(TYPE_LABEL[j.type]) }, { label: t('Customer'), v: (j) => j.customer || t('Mill') },
      { label: t('Variety / product'), v: (j) => j.item }, { label: t('Quantity used'), num: true, v: (j) => nf(j.qty) + ' ' + unitFor(j.inputKind) },
      { label: t('Outputs'), v: (j) => (j.outputs || []).map((o) => o.product + ' ' + nf(o.bags)).join(', ') }, { label: t('Status'), v: (j) => t(STATUS_LABEL[j.status]) }];
    const outs = {}; rows.forEach((j) => (j.outputs || []).forEach((o) => (outs[o.product] = (outs[o.product] || 0) + o.bags)));
    summary = statCard(t('Jobs'), nf(rows.length)) + statCard(t('Paddy used (baskets)'), nf(sum(rows.filter((j) => j.inputKind === 'paddy'), 'qty'))) + Object.entries(outs).map(([p, n]) => statCard(p, nf(n) + ' ' + t('bags'))).join('');
  } else if (k === 'recv' || k === 'pay') {
    rows = (k === 'recv' ? receivables() : payables()).sort((a, b) => b.days - a.days);
    cols = [{ label: t('Type'), v: (r) => t(r.type) }, { label: t('Name'), v: (r) => r.party }, { label: t('Reference'), v: (r) => r.ref }, { label: t('Date'), v: (r) => r.date },
      { label: t('Days'), num: true, v: (r) => r.days }, { label: t('Balance'), num: true, v: (r) => nf(r.due) }];
    foot = ['', '', '', '', '', nf(sum(rows, 'due'))];
  } else if (k === 'moves') {
    rows = db.moves.filter((m) => inRange(m.date)).sort((a, b) => a.date.localeCompare(b.date));
    cols = [{ label: t('Date'), v: (m) => m.date }, { label: t('Type'), v: (m) => t(KIND_LABEL[m.kind]) }, { label: t('Item'), v: (m) => m.item }, { label: t('Owner'), v: (m) => m.owner === 'mill' ? t('Mill') : m.ownerName },
      { label: t('In'), num: true, v: (m) => m.qty > 0 ? nf(m.qty) : '' }, { label: t('Out'), num: true, v: (m) => m.qty < 0 ? nf(-m.qty) : '' }, { label: t('Reference'), v: (m) => m.ref }, { label: t('Note'), v: (m) => m.note === 'output' ? t('Job output') : m.note }];
  }
  return { cols, rows, foot, summary, printHTML: simpleTableHTML(cols, rows, foot) };
}

/* =================== AUDIT LOGS =================== */
function pageAudit() {
  const s = ui('audit');
  const types = [...new Set(db.audit.map((a) => a.type))];
  let rows = db.audit;
  if (s.type) rows = rows.filter((a) => a.type === s.type);
  if (s.sev) rows = rows.filter((a) => a.severity === s.sev);
  const sevL = { info: 'Info', warn: 'Notice', danger: 'Critical' };
  return pageHead(t('Audit logs'), t('Watch important actions and updates in the system.')) +
   `<div class="card"><div class="filters">
    <select onchange="${act((e) => { s.type = e.target.value; render(); })}"><option value="">${t('Choose type')}: ${t('All')}</option>${types.map((x) => `<option value="${x}" ${s.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <select onchange="${act((e) => { s.sev = e.target.value; render(); })}"><option value="">${t('Severity')}: ${t('All')}</option>${Object.entries(sevL).map(([k, l]) => `<option value="${k}" ${s.sev === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
    <button class="btn ghost sm" onclick="${act(() => { s.type = ''; s.sev = ''; render(); })}">${t('Reset filters')}</button></div>
    ${table([{ label: t('Time'), v: (a) => new Date(a.at).toLocaleString() }, { label: t('User'), v: (a) => a.role === 'owner' ? t('Owner') : a.role === 'cashier' ? t('Cashier') : '' },
      { label: t('Type'), v: (a) => a.type }, { label: t('Action'), v: (a) => a.action }, { label: t('Details'), v: (a) => a.detail },
      { label: t('Severity'), html: (a) => badge(t(sevL[a.severity] || a.severity), a.severity === 'warn' ? 'warn' : a.severity === 'danger' ? 'danger' : '') }], rows.slice(0, 500), { empty: t('No recent records yet.') })}</div>`;
}

/* =================== SETTINGS =================== */
function pageSettings() {
  const S = db.settings;
  const save = (msg) => { saveDB(); audit('settings', 'update', msg); saveDB(); toast(t('Saved')); render(); };
  const pinBlock = (role) => { const lock = role === 'owner' && !Session.isOwner, dis = lock ? ' disabled' : ''; return `<div class="sub-card"><h4>${t(role === 'owner' ? 'Owner account PIN' : 'Cashier account PIN')}</h4>
    <input type="password" inputmode="numeric" maxlength="4" placeholder="${esc(t('New PIN'))}" id="pin1_${role}"${dis}><input type="password" inputmode="numeric" maxlength="4" placeholder="${esc(t('Repeat PIN'))}" id="pin2_${role}"${dis}>
    <button class="btn primary sm"${dis} onclick="${act(() => {
      if (lock) return;
      const a = document.getElementById('pin1_' + role).value, b = document.getElementById('pin2_' + role).value;
      if (!/^\d{4}$/.test(a)) return toast(t('PIN must be 4 digits.'), 'err');
      if (a !== b) return toast(t('PINs do not match.'), 'err');
      S.pins[role] = a; audit('settings', 'pin', role, 'warn'); saveDB(); toast(t('PIN changed')); render();
    })}">${t('Change PIN')}</button>${lock ? `<p class="muted sm">${t('Can only be changed when signed in as the owner.')}</p>` : ''}</div>`; };
  const listEditor = (title, arr, key, inUse) => `<div class="card"><h3>${esc(title)}</h3><div class="muted sm">${t('Current items')}</div>
    <div class="tag-list">${arr.map((x, i) => `<span class="tag">${esc(x)} <button onclick="${act(() => { if (inUse && inUse(x)) return toast(t('Items in use cannot be removed.'), 'err'); arr.splice(i, 1); save(title); })}">✕</button></span>`).join('')}</div>
    <div class="inline-form"><input id="add_${key}" placeholder="${esc(t('Add new item'))}"><button class="btn primary sm" onclick="${act(() => { const v = document.getElementById('add_' + key).value.trim(); if (!v) return; if (arr.includes(v)) return toast(t('Already exists'), 'err'); arr.push(v); save(title); })}">${t('Add')}</button></div></div>`;
  const outputs = (group, title) => `<div class="sub-card"><div class="row-between"><h4>${esc(t(title))}</h4>${btn('+ ' + t('Add new'), act(() => outputForm(group)), 'ghost sm')}</div>
    ${table([{ label: t('Name'), v: (o) => o.name }, { label: t('Description'), v: (o) => o.desc }, { label: t('1 bag = ? ' + 'viss'), num: true, v: (o) => nf(o.bagViss) },
      { label: t('Default'), v: (o) => o.isDefault ? '✔️' : '✖️' }, { label: t('Actions'), html: (o) => rowActions([[t('Edit'), () => outputForm(group, o)],
        [t('Remove'), () => { if (db.moves.some((m) => m.kind === group && m.item === o.name)) return toast(t('Items in use cannot be removed.'), 'err'); confirmBox(t('Remove this item?'), () => { S.outputs[group].splice(S.outputs[group].indexOf(o), 1); save(title); }); }, 'danger']]) }], S.outputs[group])}</div>`;
  return pageHead(t('Settings'), '') +
   `<div class="card"><h3>${t('Security PIN')}</h3><p class="muted">${t('Change the PINs used to sign in to the owner and cashier accounts here. A PIN must be 4 digits.')}</p><div class="grid-2col">${pinBlock('owner')}${pinBlock('cashier')}</div></div>
   <div class="card"><h3>${t('Fingerprint reader')}</h3>
    <label class="chk"><input type="checkbox" ${S.fingerprint ? 'checked' : ''} onchange="${act((e) => { S.fingerprint = e.target.checked; save('fingerprint'); })}"> ${t('Use fingerprint recording in records')}</label>
    <p class="muted sm">${t('When selected, a fingerprint button appears on record forms that support it.')}</p>
    <button class="btn ghost sm" onclick="${act(checkFingerprint)}">${t('Check fingerprint reader')}</button></div>
   <div class="grid-2col">
    <div class="card"><h3>${t('Unit display')}</h3><p class="muted sm">${t('Weight can be shown in viss or pounds. Current unit')}: <b>${S.weightUnit === 'lb' ? t('lb') : t('viss')}</b></p>
     <select id="wu"><option value="viss" ${S.weightUnit === 'viss' ? 'selected' : ''}>${t('viss')}</option><option value="lb" ${S.weightUnit === 'lb' ? 'selected' : ''}>${t('lb')}</option></select>
     <button class="btn primary sm" onclick="${act(() => { S.weightUnit = document.getElementById('wu').value; save('weightUnit'); })}">${t('Save')}</button></div>
    <div class="card"><h3>${t('Sales voucher print size')}</h3><p class="muted sm">${t('Choose the paper size used for printing vouchers.')}</p>
     <select id="vs"><option value="a5" ${S.voucherSize === 'a5' ? 'selected' : ''}>${t('A5 paper')}</option><option value="80mm" ${S.voucherSize === '80mm' ? 'selected' : ''}>${t('3-inch thermal (80mm)')}</option></select>
     <button class="btn primary sm" onclick="${act(() => { S.voucherSize = document.getElementById('vs').value; save('voucherSize'); })}">${t('Save')}</button></div>
    <div class="card"><h3>${t('Sales stock check')}</h3>
     <label class="chk"><input type="checkbox" ${S.stockCheck ? 'checked' : ''} onchange="${act((e) => { S.stockCheck = e.target.checked; save('stockCheck'); })}"> ${t('Check stock when selling')}</label>
     <p class="muted sm">${t('If unticked, the system will no longer block sales when stock is not enough.')}</p></div>
    <div class="card"><h3>${t('Unit conversion rates')}</h3><div class="inline-form"><span>${t('Paddy')}: ${t('1 bag =')}</span><input id="b2b" type="number" step="any" value="${S.bagToBasket}" style="width:90px"><span>${t('baskets')}</span>
     <button class="btn primary sm" onclick="${act(() => { const v = num(document.getElementById('b2b').value); if (v <= 0) return toast(t('Amount must be more than 0'), 'err'); S.bagToBasket = v; save('bagToBasket'); })}">${t('Save')}</button></div>
     <p class="muted sm">${t('Rice: set each product\'s bag-to-viss ratio by editing it in "Output products" below.')}</p></div>
   </div>
   <div class="grid-2col">${listEditor(t('Paddy varieties'), S.varieties, 'var', (x) => db.moves.some((m) => m.kind === 'paddy' && m.item === x))}
    ${listEditor(t('Expense categories'), S.expenseCategories, 'cat', (x) => db.expenses.some((e) => e.category === x))}</div>
   <div class="card"><h3>${t('Payment methods')}</h3>${table([{ label: t('Name'), v: (m) => m.name }, { label: t('Cash (goes to cash drawer)'), v: (m) => m.cash ? '✔️' : '' },
     { label: t('Actions'), html: (m) => rowActions([[t('Edit'), () => methodForm(m)], [t('Remove'), () => { if (db.payments.some((p) => p.method === m.name)) return toast(t('Items in use cannot be removed.'), 'err'); S.paymentMethods.splice(S.paymentMethods.indexOf(m), 1); save('paymentMethods'); }, 'danger']]) }], S.paymentMethods)}
     ${btn('+ ' + t('Add new method'), act(() => methodForm()), 'ghost sm')}</div>
   <div class="card"><h3>${t('Output products')}</h3><div class="grid-2col">${outputs('milling', 'Milling outputs')}${outputs('polishing', 'Polishing outputs')}</div></div>
   <div class="card danger-zone"><h3>${t('Delete data')}</h3><p class="muted">${t('Permanently deletes all business records. Account information and settings are not deleted.')}</p>
    <p class="muted sm">${t('This can only be done with the owner account.')}</p>${Session.isOwner ? btn(t('Delete business records'), act(wipeData), 'danger') : `<button class="btn danger" disabled>${t('Delete business records')}</button>`}</div>`;
}
function outputForm(group, o) {
  formModal({
    title: o ? t('Edit') + ' — ' + o.name : t('Add new'),
    fields: [{ k: 'name', label: t('Name'), req: true }, { k: 'desc', label: t('Description') }, { k: 'bagViss', label: t('1 bag = ? viss'), type: 'number', min: 0 }, { k: 'isDefault', label: t('Use by default'), type: 'checkbox' }],
    values: o || { isDefault: true },
    onSubmit: (v) => {
      const arr = db.settings.outputs[group];
      if (arr.some((x) => x !== o && x.name === v.name)) return t('Already exists');
      if (o && o.name !== v.name && db.moves.some((m) => m.kind === group && m.item === o.name)) return t('Items in use cannot be renamed.');
      if (o) Object.assign(o, v); else arr.push({ ...v, bagViss: num(v.bagViss) });
      audit('settings', 'outputs', v.name); toast(t('Saved'));
    },
  });
}
function methodForm(m) {
  formModal({
    title: m ? t('Edit') : t('Add new method'),
    fields: [{ k: 'name', label: t('Name'), req: true }, { k: 'cash', label: t('Cash (goes to cash drawer)'), type: 'checkbox' }],
    values: m || {},
    onSubmit: (v) => {
      if (db.settings.paymentMethods.some((x) => x !== m && x.name === v.name)) return t('Already exists');
      if (m && m.name !== v.name && db.payments.some((p) => p.method === m.name)) return t('Items in use cannot be renamed.');
      if (m) Object.assign(m, v); else db.settings.paymentMethods.push(v);
      audit('settings', 'paymentMethods', v.name); toast(t('Saved'));
    },
  });
}
async function checkFingerprint() {
  try {
    const ok = window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    toast(ok ? t('Fingerprint reader found.') : t('No fingerprint reader found on this device.'), ok ? 'ok' : 'err');
  } catch (e) { toast(t('No fingerprint reader found on this device.'), 'err'); }
}
function wipeData() {
  if (!Session.isOwner) return;
  formModal({
    title: t('Delete business records'),
    intro: `<span class="neg">${t('This cannot be undone. Download a backup first.')}</span><br>${t('Type DELETE to confirm.')}`,
    fields: [{ k: 'c', label: t('Confirmation'), req: true }],
    submitLabel: t('Delete'),
    onSubmit: (v) => {
      if (v.c !== 'DELETE') return t('Type DELETE to confirm.');
      const keep = db.settings; const fresh = defaultDB(); fresh.settings = keep; db = fresh; Cloud.force = true;
      audit('settings', 'wipe', t('All business records deleted'), 'danger'); toast(t('Deleted'));
    },
  });
}

/* =================== BACKUP / RESTORE =================== */
function pageBackup() {
  return pageHead(t('Backup / Restore'), t('Save business records as a file and restore them when needed.')) +
   `<div class="grid-2col"><div class="card"><h3>${t('Download backup')}</h3><p class="muted">${t('This file contains all business records and settings.')}</p>
     ${btn(t('Download backup file'), act(() => { downloadFile('san-ledger-backup-' + today() + '.json', JSON.stringify(db, null, 1), 'application/json'); db.settings.lastBackup = new Date().toISOString(); audit('backup', 'download', ''); saveDB(); render(); }))}
     ${db.settings.lastBackup ? `<p class="muted sm">${t('Last backup')}: ${new Date(db.settings.lastBackup).toLocaleString()}</p>` : ''}</div>
    <div class="card"><h3>${t('Restore from backup file')}</h3><p class="muted">${t('Restoring replaces all current business records. Current records are deleted and the records from the chosen backup are loaded. Back up your current data first.')}</p>
     <input type="file" accept=".json,application/json" onchange="${act(restoreFile)}"></div></div>
   <div class="card note"><p>${t('Backup files contain business and financial information. Keep the file in a safe place.')}</p>
    <p class="muted sm">${t('Data is saved in this browser on this computer. Download a backup regularly so data is not lost if the browser is cleared.')}</p></div>`;
}
function restoreFile(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.settings || !Array.isArray(data.jobs)) throw new Error('bad');
      confirmBox(t('Replace all current records with this backup?'), () => {
        db = migrate(data); Cloud.force = true; audit('backup', 'restore', f.name, 'danger'); saveDB(); toast(t('Restored')); render();
      });
    } catch (err) { toast(t('This is not a valid backup file.'), 'err'); }
  };
  r.readAsText(f);
}

/* =================== GUIDES =================== */
function pageGuides() {
  const s = ui('guides');
  const L = (en, my) => (curLang() === 'my' ? my : en);
  const q = (s.q || '').toLowerCase();
  const html = GUIDES.map((sec) => {
    const items = sec.items.filter((it) => !q || (it.t.en + it.t.my + it.b.en + it.b.my).toLowerCase().includes(q));
    if (!items.length) return '';
    return `<div class="card"><h3>${esc(L(sec.t.en, sec.t.my))}</h3><p class="muted">${esc(L(sec.d.en, sec.d.my))}</p>
      ${items.map((it) => `<details class="guide"><summary>${esc(L(it.t.en, it.t.my))}</summary><div>${L(it.b.en, it.b.my).split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>`).join('')}</div>`;
  }).join('');
  return pageHead(t('User guide'), t('Get the most out of the guides most used in daily work.')) +
   `<div class="card"><input class="wide" placeholder="${esc(t('Search guides'))}" value="${esc(s.q || '')}" oninput="${act((e) => { s.q = e.target.value; clearTimeout(s._t); s._t = setTimeout(() => { render(); const el = document.querySelector('input.wide'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); })}"></div>` + (html || `<div class="empty">${t('No guides found.')}</div>`);
}
const G = (en, my) => ({ en, my });
const GUIDES = [
  { t: G('Getting started', 'စတင်အသုံးပြုခြင်း'), d: G('Basic steps to sign in and start using the app.', 'အကောင့်ဝင်ခြင်းနှင့် စတင်အသုံးပြုရန် လိုအပ်သည့် အခြေခံအဆင့်များ။'), items: [
    { t: G('Signing in and choosing a role', 'အကောင့်ဝင်ခြင်းနှင့် အခန်းကဏ္ဍရွေးချယ်ခြင်း'), b: G(
      'Open the app and choose Owner or Cashier.\nEnter the 4-digit PIN and press Open. If it is correct, the app opens.\nTo switch roles, press Log out at the top right and sign in again with the other role.\nIf you forget a PIN, sign in as the owner and change it on the Settings page.',
      'App ကိုဖွင့်ပြီး ပိုင်ရှင် သို့မဟုတ် စာရင်းကိုင် အခန်းကဏ္ဍ ရွေးချယ်ပါ။\nPIN ကို ထည့်သွင်းပြီး ဖွင့်မည် ခလုတ်ကို နှိပ်ပါ။ မှန်ကန်ပါက App စာမျက်နှာပေါ်လာပါလိမ့်မည်။\nအခန်းကဏ္ဍပြောင်းရန် App ၏ အပေါ်ပိုင်း ညာဘက်တွင်ရှိသော ထွက်ရန် ခလုတ်ကို ရွေးချယ်ပါ။ ထွက်ပြီးနောက် သင်လိုချင်သော အခန်းကဏ္ဍဖြင့် ပြန်လည်ဝင်ရောက်ပါ။\nPIN မေ့သွားပါက ပိုင်ရှင်အကောင့်ဖြင့် ဝင်ပြီး ချိန်ညှိချက်များ စာမျက်နှာမှ အသစ်ပြောင်းလဲနိုင်ပါသည်။') },
    { t: G('Entering business information', 'လုပ်ငန်းအချက်အလက်များထည့်သွင်းခြင်း'), b: G(
      'Press the profile button (the round initials button next to Log out). Enter the business name, address and phone numbers, and choose the business type (rice mill or rice polishing mill).\nOn the Settings page, add the paddy varieties and output products you use, and set the units and the bag/basket conversion.',
      'ထွက်ရန် ခလုတ်ဘေးတွင်ရှိသော ပရိုဖိုင်ခလုတ်ကိုနှိပ်ပါ။ လုပ်ငန်းအမည်၊ လိပ်စာ၊ ဆက်သွယ်ရမည့် ဖုန်းနံပါတ်များကို ထည့်သွင်းပါ။ လုပ်ငန်းအမျိုးအစား(ဆန်စက် သို့မဟုတ် ဆန်ရွေးစက်) ကို ရွေးချယ်ပါ။\nချိန်ညှိချက်များစာမျက်နှာသို့ ဝင်ရောက်ပြီး အသုံးပြုရန် လိုအပ်သော စပါးအမျိုးအစားများ၊ ထွက်ကုန်အမျိုးအစားများကို ထည့်သွင်းပါ။ ယူနစ်၊ အိတ်၊ တင်း ဆက်နွယ်ချက်များကို ပြင်ဆင်ပါ။') },
    { t: G('Language', 'ဘာသာစကား'), b: G('Use the EN / မြန်မာ switch at the top of every page (and on the sign-in screen) to change the language at any time.', 'စာမျက်နှာတိုင်း၏ အပေါ်ဘက်ရှိ EN / မြန်မာ ခလုတ်ဖြင့် ဘာသာစကားကို အချိန်မရွေး ပြောင်းနိုင်ပါသည်။') },
  ] },
  { t: G('Daily work', 'နေ့စဉ် လုပ်ငန်းစဉ်များ'), d: G('Do buying, receiving, outputs and delivery step by step in one place.', 'ဝယ်ယူခြင်း၊ လက်ခံခြင်း၊ ထွက်ကုန်သတ်မှတ်ခြင်း၊ သယ်ပို့ခြင်း စသည့် လုပ်ငန်းများကို တစ်နေရာတည်းတွင် အဆင့်လိုက် လုပ်ဆောင်ပါ။'), items: [
    { t: G('Opening and closing the cash drawer', 'ငွေသားအံဆွဲ ဖွင့်ခြင်းပိတ်ခြင်း'), b: G(
      'Each morning open the cash drawer with the cash you start with. Every cash payment in the app (purchases, sales, fees, expenses, advances) is counted automatically.\nAt the end of the day press "Close today\'s books" and enter the cash you actually counted. The app shows any shortage or overage.',
      'နံနက်တိုင်း လက်ရှိငွေသားဖြင့် ငွေသားအံဆွဲကို ဖွင့်ပါ။ ငွေသားဖြင့် ပေးချေ/လက်ခံသမျှ (ဝယ်ယူမှု၊ ရောင်းချမှု၊ လုပ်ခ၊ အသုံးစရိတ်၊ ကြိုငွေ) ကို အလိုအလျောက် ထည့်တွက်ပါမည်။\nနေ့ကုန်တွင် "ယနေ့ စာရင်းပိတ်မည်" ကိုနှိပ်ပြီး အမှန်ရေတွက်ထားသောငွေကို ထည့်ပါ။ ပိုငွေ/လိုငွေကို ပြသပေးပါမည်။') },
    { t: G('Recording a paddy purchase and paying for it', 'စပါးဝယ်ယူခြင်း မှတ်တမ်းထည့်ခြင်းနှင့် ငွေပေးချေခြင်း'), b: G(
      'On Paddy Purchases press "Buy paddy". Enter the seller, variety, bags, baskets and price per basket. Enter how much you paid now; the rest stays as a balance.\nLater press "Pay" on the row to pay the balance. Purchased paddy is added to mill-owned stock.',
      'စပါးဝယ်ယူခြင်း စာမျက်နှာတွင် "စပါးဝယ်ယူမည်" ကိုနှိပ်ပါ။ ရောင်းသူ၊ စပါးအမျိုးအစား၊ အိတ်၊ တင်း နှင့် တစ်တင်းဈေးကို ထည့်ပါ။ ယခုပေးငွေကို ထည့်ပါ၊ ကျန်ငွေကို ပေးရန်ကျန်အဖြစ် မှတ်ထားပါမည်။\nနောက်မှ "ပေးချေမည်" ကိုနှိပ်၍ ကျန်ငွေကို ပေးချေနိုင်ပါသည်။ ဝယ်ယူသောစပါးသည် စက်ပိုင်ကုန်လက်ကျန်သို့ ဝင်ပါမည်။') },
    { t: G('Recording a customer paddy receipt', 'စပါးလက်ခံခြင်း မှတ်တမ်းထည့်ခြင်း'), b: G(
      'On Paddy Receipts press "New receipt" when a customer brings paddy to be milled. If the mill paid the truck fee, enter it in the transport field; it is recorded in Transport Advances so the customer can repay it.',
      'ဖောက်သည်က ကြိတ်ခွဲရန် စပါးယူလာပါက စပါးလက်ခံခြင်း စာမျက်နှာတွင် "လက်ခံစာရင်းအသစ်" ကိုနှိပ်ပါ။ ဆန်စက်မှ ကားခစိုက်ပေးခဲ့ပါက ကားခအကွက်တွင် ထည့်ပါ၊ ကားခစိုက်ငွေ စာမျက်နှာတွင် မှတ်တမ်းဝင်ပါမည်။') },
    { t: G('Managing jobs', 'လုပ်ငန်းစဉ်များ စီမံခန့်ခွဲခြင်း'), b: G(
      'Press "New job" (or "Start job" on a receipt). Choose milling or polishing, the source (customer deposit or mill purchase) and the quantity.\nMove the job through the stages: received → drying → milling/polishing. Press "Outputs" to record rice, broken rice, bran, etc.\nPress "Settle" to collect the service fee, then "Collect" when the customer takes the goods; a delivery order is printed.',
      '"လုပ်ငန်းစဉ်အသစ်" (သို့မဟုတ် လက်ခံစာရင်းမှ "လုပ်ငန်းစတင်") ကိုနှိပ်ပါ။ ကြိတ်ခွဲ/ဆန်ရွေး၊ အရင်းအမြစ် (ဖောက်သည်အပ်နှံမှု/ဆန်စက်ဝယ်ယူမှု) နှင့် ပမာဏကို ရွေးပါ။\nအဆင့်များ: လက်ခံ → အခြောက်ခံ → ကြိတ်ခွဲ/ဆန်ရွေး။ "ထွက်ကုန်" ကိုနှိပ်၍ ဆန်၊ ဆန်ကွဲ၊ ဖွဲ စသည်တို့ကို မှတ်တမ်းတင်ပါ။\n"ငွေရှင်းမည်" ဖြင့် လုပ်ခကောက်ပြီး ဖောက်သည်ထုတ်ယူချိန်တွင် "ထုတ်ယူမည်" ကိုနှိပ်ပါ။ ကုန်ပို့အော်ဒါ ထုတ်ပေးပါမည်။') },
    { t: G('Recording sales and credit payments', 'ကုန်ရောင်းခြင်းနှင့် အကြွေးရငွေ မှတ်တမ်းထည့်ခြင်း'), b: G(
      'On Sales press "Add sale", add one or more products, the amount paid now and a credit due date if there is a balance. A voucher prints automatically.\nWhen the customer pays later, press "Receive payment". Press "Deliver" to issue goods (all at once or in parts).',
      'ကုန်ရောင်းခြင်း စာမျက်နှာတွင် "အရောင်းမှတ်တမ်းထည့်ရန်" ကိုနှိပ်ပြီး ကုန်ပစ္စည်းများ၊ ယခုပေးငွေ နှင့် ကျန်ငွေရှိပါက အကြွေးဆပ်ရမည့်ရက်ကို ထည့်ပါ။ ဘောင်ချာ အလိုအလျောက်ထုတ်ပေးပါမည်။\nနောက်မှ ငွေပေးပါက "ငွေလက်ခံမည်" ကိုနှိပ်ပါ။ ကုန်ပို့ရန် "ကုန်ပို့မည်" ကိုနှိပ်ပါ (တစ်ခါတည်း သို့မဟုတ် အပိုင်းလိုက်)။') },
    { t: G('Inventory', 'ကုန်လက်ကျန် စီမံခန့်ခွဲခြင်း'), b: G(
      'Inventory shows customer stock and mill-owned stock separately for paddy, rice, milling outputs and polishing outputs. Use "Add opening stock" when you start using the app, and "Adjust" after a physical count.',
      'ကုန်လက်ကျန် စာမျက်နှာတွင် စပါး၊ ဆန်၊ ကြိတ်ထွက်၊ ရွေးထွက် တို့ကို ဖောက်သည်ပိုင်နှင့် စက်ပိုင် ခွဲ၍ ပြသပါသည်။ စတင်အသုံးပြုချိန်တွင် "အဖွင့်လက်ကျန်ထည့်မည်" ကိုသုံးပြီး ရေတွက်စစ်ဆေးပြီးနောက် "ချိန်ညှိမည်" ကိုသုံးပါ။') },
  ] },
  { t: G('Expenses and advances', 'အသုံးစရိတ် စီမံခန့်ခွဲမှု'), d: G('Track expenses and advances together with the cash drawer.', 'ငွေသားအံဆွဲမှ စပြီး အသုံးစရိတ်၊ ကြိုငွေများအား ပေါင်းစည်းစောင့်ကြည့်ပါ။'), items: [
    { t: G('Recording expenses', 'အသုံးစရိတ်များ စာရင်းသွင်းခြင်း'), b: G('On Expenses press "Add expense", choose a category (electricity, fuel, repairs, labour, other) and the amount. Unpaid amounts can be paid later.', 'အသုံးစရိတ်များ စာမျက်နှာမှ "အသုံးစရိတ်ထည့်သွင်းမည်" ကိုနှိပ်ပြီး အမျိုးအစားနှင့် ပမာဏကို ထည့်ပါ။ မပေးရသေးသော ငွေကို နောက်မှ ပေးချေနိုင်ပါသည်။') },
    { t: G('Transport advances', 'ကားခစိုက်ငွေ စောင့်ကြည့်ခြင်း'), b: G('Truck fees the mill pays for customers when receiving paddy are listed here. Press "Record repayment" when the customer pays back.', 'စပါးလက်ခံစဉ်တွင် စိုက်ပေးခဲ့ရသော ကားခများကို ဤနေရာတွင် ပြသပါသည်။ ဖောက်သည် ပြန်ပေးချိန်တွင် "ပြန်ဆပ်ငွေ မှတ်တမ်းတင်မည်" ကိုနှိပ်ပါ။') },
    { t: G('Salary advances', 'လုပ်ခကြိုငွေ စီမံခန့်ခွဲခြင်း'), b: G('Record money advanced to workers and their repayments on the Salary Advances page.', 'လုပ်ခကြိုငွေ စာမျက်နှာမှ အလုပ်သမားကြိုငွေများနှင့် ပြန်ဆပ်ငွေများကို မှတ်တမ်းတင်ပါ။') },
  ] },
  { t: G('Overview and reports', 'သုံးသပ်ချက်နှင့် သတင်းအချက်အလက်'), d: G('Know how the business is doing in real time.', 'လုပ်ငန်းအခြေအနေများကို အချိန်နှင့်တပြေးညီ သိရှိပါ။'), items: [
    { t: G('Dashboard', 'လုပ်ငန်းသုံးသပ်ချက်'), b: G('The owner\'s dashboard shows job counts, this month\'s net income and charts for sales, expenses, paddy received, outputs and money to receive.', 'ပိုင်ရှင်၏ လုပ်ငန်းသုံးသပ်ချက်တွင် လုပ်ငန်းစဉ်အရေအတွက်၊ ယခုလ အသားတင်ဝင်ငွေ နှင့် ရောင်းရငွေ၊ စရိတ်၊ စပါးလက်ခံ၊ ကြိတ်ထွက်၊ ရရန်ကျန်ငွေ ဇယားများကို ပြသပါသည်။') },
    { t: G('Viewing reports', 'အစီရင်ခံစာများ ကြည့်ရှုခြင်း'), b: G('Reports has 8 reports. Choose a date range, then print or export to CSV (opens in Excel).', 'အစီရင်ခံစာများ စာမျက်နှာတွင် အစီရင်ခံစာ ၈ မျိုးရှိပါသည်။ ရက်စွဲရွေးပြီး ပုံနှိပ်ခြင်း သို့မဟုတ် CSV (Excel) ထုတ်ယူနိုင်ပါသည်။') },
    { t: G('Audit logs', 'အသုံးပြုမှုမှတ်တမ်း ကြည့်ရှုခြင်း'), b: G('Every sign-in, new record, edit and delete is logged with the user role and time.', 'အကောင့်ဝင်ခြင်း၊ မှတ်တမ်းအသစ်၊ ပြင်ဆင်ခြင်း၊ ဖျက်ခြင်း အားလုံးကို အသုံးပြုသူနှင့် အချိန်ဖြင့် မှတ်တမ်းတင်ထားပါသည်။') },
  ] },
  { t: G('Troubleshooting', 'ပြဿနာဖြေရှင်းနည်းများ'), d: G('Practical fixes for common situations.', 'အသုံးပြုစဉ်တွင် မကြာခဏကြုံနိုင်သော အခြေအနေများအတွက် လက်တွေ့ဖြေရှင်းနည်းများ။'), items: [
    { t: G('Records do not appear', 'မှတ်တမ်းများ ပေါ်မလာပါက'), b: G('Clear the search box and filters. Check the date range. Data is stored in this browser only; another computer or browser will not show it unless you restore a backup there.', 'ရှာဖွေရေးအကွက်နှင့် စစ်ထုတ်မှုများကို ရှင်းပါ။ ရက်စွဲကို စစ်ပါ။ အချက်အလက်များကို ဤ browser တွင်သာ သိမ်းထားသဖြင့် အခြားကွန်ပျူတာတွင် backup ပြန်ယူမှသာ ပေါ်ပါမည်။') },
    { t: G('Totals do not match', 'စုစုပေါင်းငွေ မမှန်ပါက'), b: G('Check that every payment used the right payment method. Only methods marked "Cash" count in the cash drawer. Check Audit Logs for recent edits or deletes.', 'ငွေပေးချေမှုတိုင်း မှန်ကန်သော နည်းလမ်းဖြင့် ထည့်ထားခြင်း ရှိမရှိ စစ်ပါ။ "ငွေသား" အဖြစ် သတ်မှတ်ထားသော နည်းလမ်းများသာ ငွေသားအံဆွဲတွင် တွက်ပါသည်။ အသုံးပြုမှုမှတ်တမ်းတွင် ပြင်ဆင်/ဖျက်ထားမှုများကို စစ်ပါ။') },
    { t: G('A record will not save', 'စာရင်းသွင်းသည်ကို မသိမ်းပါက'), b: G('Read the red message at the bottom of the form. Fill all fields marked *, and make sure quantities are not more than the available stock (or turn off the stock check in Settings).', 'ဖောင်အောက်ခြေရှိ အနီရောင်စာကို ဖတ်ပါ။ * ပါသော အကွက်များကို ဖြည့်ပါ။ ပမာဏသည် လက်ကျန်ထက် မပိုစေရ (သို့မဟုတ် ချိန်ညှိချက်တွင် ကုန်လက်ကျန်စစ်ဆေးမှုကို ပိတ်ပါ)။') },
  ] },
];
