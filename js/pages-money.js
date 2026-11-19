/* SAN Ledger — cash drawer, expenses, other income, advances */
const SOURCE_NAMES = {
  'paddy-purchase': 'Paddy purchase', 'rice-purchase': 'Rice purchase', sale: 'Sale', 'job-fee': 'Service fee',
  expense: 'Expense', 'other-income': 'Other income', 'transport-advance': 'Transport advance', 'transport-repay': 'Transport advance repaid',
  'salary-advance': 'Salary advance', 'salary-repay': 'Salary advance repaid',
  'customer-advance': 'Cash advance', 'purchase-transport': 'Transport fee',
};

/* =================== CASH DRAWER =================== */
function pageCashDrawer() {
  const s = ui('cash'); s.date = s.date || today();
  const sm = drawerSummary(s.date);
  const d = sm.drawer;
  const isToday = s.date === today();
  const actions = [
    !d && btn(t('Open cash drawer'), act(() => drawerOpenForm(s.date))),
    d && !d.closed && btn(t('Add top-up cash'), act(() => drawerTopupForm(d)), 'ghost'),
    d && !d.closed && btn(isToday ? t('Close today\'s books') : t('Close books'), act(() => drawerCloseForm(d, sm))),
    d && d.closed && Session.isOwner && btn(t('Reopen'), act(() => { d.closed = false; audit('cash', 'reopen', d.date, 'warn'); saveDB(); render(); }), 'ghost'),
  ].filter(Boolean).join('');
  const diff = sm.actual !== null ? sm.actual - sm.expected : null;
  return pageHead(t('Cash Drawer'), t('Manage the daily cash drawer opening and closing and watch money in and out here.'), actions) +
   `<div class="card"><div class="filters"><span class="muted">${t('Selected date')}</span><input type="date" value="${s.date}" onchange="${act((e) => { s.date = e.target.value || today(); render(); })}">
     ${d ? badge(d.closed ? t('Closed') : t('Open'), d.closed ? '' : 'ok') : `<span class="warn-text">${esc(isToday ? t('The cash drawer has not been opened for today yet.') : t('No cash drawer for this date.'))}</span>`}</div></div>
   <div class="card"><h3>${t('Daily summary')}</h3><div class="stats">
    ${statCard(t('Opening cash'), money(sm.opening))}${statCard(t('Top-up cash'), money(sm.topups))}
    ${statCard(t('Cash in'), money(sm.cin), '', '', 'pos')}${statCard(t('Cash out'), money(sm.cout), '', '', 'negc')}
    ${statCard(t('Expected balance'), money(sm.expected))}
    ${statCard(t('Actual balance'), sm.actual !== null ? money(sm.actual) : '—', diff !== null ? (Math.abs(diff) < 0.5 ? t('Matches') : (diff > 0 ? t('Over') : t('Short')) + ' ' + money(Math.abs(diff))) : '', '', diff !== null && Math.abs(diff) >= 0.5 ? 'warn' : '')}
   </div></div>
   <div class="card"><h3>${t('Cash movements')}</h3>${table([
     { label: t('Type'), v: (p) => t(SOURCE_NAMES[p.source] || p.source) }, { label: t('Name'), v: (p) => p.party }, { label: t('Note'), v: (p) => p.note },
     { label: t('In'), num: true, html: (p) => p.dir === 'in' ? `<span class="pos">${money(p.amount)}</span>` : '' },
     { label: t('Out'), num: true, html: (p) => p.dir === 'out' ? `<span class="neg">${money(p.amount)}</span>` : '' }],
     [...(d ? (d.topups || []).map((x) => ({ source: 'topup', party: '', note: x.note, dir: 'in', amount: x.amount, _t: 1 })) : []), ...sm.flows].map((p) => p._t ? { ...p, source: t('Top-up cash') } : p),
     { empty: t('No cash movements for this date yet.') })}</div>
   <div class="card"><h3>${t('Cash drawer records')}</h3>${table([
     { label: t('Date'), html: (x) => `<a href="#" onclick="${act((e) => { e.preventDefault(); s.date = x.date; render(); })}">${esc(x.date)}</a>` },
     { label: t('Opening cash'), num: true, v: (x) => money(x.opening) },
     { label: t('Expected balance'), num: true, v: (x) => money(drawerSummary(x.date).expected) },
     { label: t('Actual balance'), num: true, v: (x) => x.closed ? money(x.actual) : '—' },
     { label: t('Difference'), num: true, html: (x) => { if (!x.closed) return '—'; const df = num(x.actual) - drawerSummary(x.date).expected; return `<span class="${Math.abs(df) < 0.5 ? '' : 'neg'}">${money(df)}</span>`; } },
     { label: t('Status'), html: (x) => badge(x.closed ? t('Closed') : t('Open'), x.closed ? '' : 'ok') }],
     db.drawers.slice().sort((a, b) => b.date.localeCompare(a.date)), { empty: t('No records yet.') })}</div>`;
}
function drawerOpenForm(date) {
  const prev = db.drawers.filter((x) => x.date < date && x.closed).sort((a, b) => b.date.localeCompare(a.date))[0];
  formModal({
    title: t('Open cash drawer') + ' — ' + date,
    fields: [{ k: 'opening', label: t('Opening cash (Ks)'), type: 'number', min: 0, req: true, def: prev ? prev.actual : 0, help: prev ? t('Last closing balance') + ': ' + money(prev.actual) : '' }, { k: 'note', label: t('Note') }],
    submitLabel: t('Open'),
    onSubmit: (v) => { db.drawers.push({ id: uid(), date, opening: num(v.opening), topups: [], closed: false, note: v.note }); audit('cash', 'open', date + ' ' + money(v.opening)); toast(t('Saved')); },
  });
}
function drawerTopupForm(d) {
  formModal({
    title: t('Add top-up cash'),
    fields: [{ k: 'amount', label: t('Amount (Ks)'), type: 'number', min: 0, req: true }, { k: 'note', label: t('Note') }],
    onSubmit: (v) => { if (v.amount <= 0) return t('Amount must be more than 0'); d.topups.push({ amount: num(v.amount), note: v.note, at: new Date().toISOString() }); audit('cash', 'topup', d.date + ' ' + money(v.amount)); toast(t('Saved')); },
  });
}
function drawerCloseForm(d, sm) {
  formModal({
    title: t('Close books') + ' — ' + d.date,
    intro: t('Expected balance') + ': <b>' + money(sm.expected) + '</b>',
    fields: [{ k: 'actual', label: t('Actual cash counted (Ks)'), type: 'number', min: 0, req: true, def: sm.expected }, { k: 'note', label: t('Note') }],
    summary: (v) => { const df = num(v.actual) - sm.expected; return `<div class="sum-line">${t('Difference')}: <b class="${Math.abs(df) < 0.5 ? '' : 'neg'}">${money(df)}</b></div>`; },
    submitLabel: t('Close books'),
    onSubmit: (v) => { Object.assign(d, { closed: true, actual: num(v.actual), closeNote: v.note, closedAt: new Date().toISOString() }); audit('cash', 'close', d.date + ' ' + money(v.actual), Math.abs(num(v.actual) - sm.expected) >= 0.5 ? 'warn' : 'info'); toast(t('Saved')); },
  });
}

/* =================== EXPENSES =================== */
function pageExpenses() {
  const s = ui('exp');
  const all = db.expenses;
  const mon = all.filter((e) => monthOf(e.date) === thisMonth());
  const unpaid = all.filter((e) => num(e.amount) - paidOut(e.id) > 0.5);
  let rows = all.slice();
  if (s.cat) rows = rows.filter((e) => e.category === s.cat);
  if (s.month) rows = rows.filter((e) => monthOf(e.date) === s.month);
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const months = [...new Set(all.map((e) => monthOf(e.date)))].sort().reverse();
  return pageHead(t('Expenses'), t('Manage business expenses and other money out'), btn(t('Add expense'), act(() => expenseForm()))) +
   `<div class="card"><h3>${t('Expense summary')}</h3><div class="stats">
     ${statCard(t('Total expenses'), moneyOrDash(sum(all, 'amount')), nf(all.length) + ' ' + t('records'))}
     ${statCard(t('Expenses this month'), moneyOrDash(sum(mon, 'amount')), t('Records this month'))}
     ${statCard(t('Remaining to pay'), moneyOrDash(sum(unpaid, (e) => e.amount - paidOut(e.id))), t('Unpaid expenses'), '', unpaid.length ? 'warn' : '')}
     ${statCard(t('Average expense'), all.length ? money(sum(all, 'amount') / all.length) : '—', t('Per record'))}</div></div>
   <div class="card"><h3>${t('Expense list')}</h3><div class="filters">
    <span class="muted">${t('Category')}</span><select onchange="${act((e) => { s.cat = e.target.value; render(); })}"><option value="">${t('All')}</option>${db.settings.expenseCategories.map((c) => `<option ${s.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <span class="muted">${t('Month')}</span><select onchange="${act((e) => { s.month = e.target.value; render(); })}"><option value="">${t('All months')}</option>${months.map((m) => `<option value="${m}" ${s.month === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
    <span class="muted">${t('Total')}: <b>${money(sum(rows, 'amount'))}</b></span></div>
   ${table([
     { label: t('No.'), v: (e) => e.no }, { label: t('Date'), v: (e) => dt(e) }, { label: t('Category'), v: (e) => e.category },
     { label: t('Description'), v: (e) => e.desc }, { label: t('Paid to'), v: (e) => e.payee },
     { label: t('Amount'), num: true, v: (e) => money(e.amount) },
     { label: t('Status'), html: (e) => { const b = e.amount - paidOut(e.id); return b > 0.5 ? badge(t('Due') + ' ' + money(b), 'warn') : badge(t('Paid'), 'ok'); } },
     { label: t('Actions'), html: (e) => rowActions([
       e.amount - paidOut(e.id) > 0.5 && [t('Pay'), () => payForm(t('Pay expense') + ' — ' + e.no, e.amount - paidOut(e.id), (v) => { addPayment({ ...v, dir: 'out', source: 'expense', refId: e.id, party: e.payee, note: e.category }); audit('expense', 'payment', e.no); }), 'primary'],
       Session.isOwner && [t('Edit'), () => expenseForm(e)],
       Session.isOwner && [t('Delete'), () => confirmBox(t('Delete this record?'), () => { removePaymentsFor(e.id); all.splice(all.indexOf(e), 1); audit('expense', 'delete', e.no, 'warn'); saveDB(); render(); }), 'danger']]) }],
     rows, { empty: t('No expense records yet. Click "Add expense" to start.') })}</div>`;
}
function expenseForm(rec) {
  formModal({
    title: rec ? t('Edit') + ' — ' + rec.no : t('Add expense') + ' · ' + peekNo('EXP'),
    fields: [
      { k: 'date', label: t('Date'), type: 'datetime', req: true },
      { k: 'category', label: t('Category'), type: 'select', options: db.settings.expenseCategories, req: true },
      { k: 'amount', label: t('Amount (Ks)'), type: 'number', min: 0, req: true },
      ...(!rec ? payStatusFields() : []),
      { k: 'desc', label: t('Description'), req: true, full: true },
      { k: 'payee', label: t('Vendor / seller') },
      { k: 'ref', label: t('Reference no.') },
      { k: 'note', label: t('Note'), type: 'textarea', full: true },
    ],
    values: rec || {},
    onSubmit: (v) => {
      if (v.amount <= 0) return t('Amount must be more than 0');
      const data = { date: v.date, time: v.time, category: v.category, desc: v.desc, payee: v.payee, ref: v.ref, note: v.note, amount: num(v.amount) };
      if (rec) { if (v.amount < paidOut(rec.id)) return t('Amount is less than what was already paid'); Object.assign(rec, data); audit('expense', 'update', rec.no, 'warn'); toast(t('Saved')); return; }
      const paid = paidFromStatus(v, num(v.amount));
      if (typeof paid === 'string') return paid;
      const e = { id: uid(), no: nextNo('EXP'), ...data };
      db.expenses.push(e);
      addPayment({ date: e.date, dir: 'out', amount: paid, method: v.method, source: 'expense', refId: e.id, party: e.payee, note: e.category + (e.desc ? ' · ' + e.desc : '') });
      audit('expense', 'create', e.no + ' ' + e.category + ' ' + money(e.amount)); toast(t('Saved'));
    },
  });
}

/* =================== OTHER INCOME =================== */
function pageOtherIncome() {
  const all = db.otherIncome;
  const mon = all.filter((e) => monthOf(e.date) === thisMonth());
  const cash = all.filter((e) => isCashMethod(e.method));
  return pageHead(t('Other income'), t('Add, edit and delete other income records and view their history.'), btn(t('New income record'), act(() => incomeForm()))) +
   `<div class="card"><h3>${t('Other income summary')}</h3><div class="stats">
    ${statCard(t('Total income'), money(sum(all, 'amount')), nf(all.length) + ' ' + t('records'))}
    ${statCard(t('Income this month'), money(sum(mon, 'amount')), t('This month'))}
    ${statCard(t('Cash income'), money(sum(cash, 'amount')), t('Added to the cash drawer'))}
    ${statCard(t('Non-cash'), money(sum(all, 'amount') - sum(cash, 'amount')), t('Transfer / KBZ Pay etc.'))}
    ${statCard(t('Average income'), money(all.length ? sum(all, 'amount') / all.length : 0), t('Per record'))}</div></div>
   <div class="card"><h3>${t('Income history')}</h3>${table([
    { label: t('No.'), v: (e) => e.no }, { label: t('Date'), v: (e) => dt(e) }, { label: t('Income source'), v: (e) => e.source },
    { label: t('Income source'), v: (e) => e.source || e.payer }, { label: t('Payment method'), v: (e) => e.method }, { label: t('Amount'), num: true, v: (e) => money(e.amount) },
    { label: t('Note'), v: (e) => e.note },
    { label: t('Actions'), html: (e) => rowActions([Session.isOwner && [t('Edit'), () => incomeForm(e)],
      Session.isOwner && [t('Delete'), () => confirmBox(t('Delete this record?'), () => { removePaymentsFor(e.id); all.splice(all.indexOf(e), 1); audit('income', 'delete', e.no, 'warn'); saveDB(); render(); }), 'danger']]) }],
    all.slice().sort((a, b) => b.date.localeCompare(a.date)), { empty: t('No other income records yet.') })}</div>`;
}
function incomeForm(rec) {
  formModal({
    title: rec ? t('Edit') + ' — ' + rec.no : t('New income record') + ' · ' + peekNo('OIN'),
    fields: [
      { k: 'date', label: t('Date'), type: 'datetime', req: true },
      { k: 'source', label: t('Income source'), ph: t('e.g. selling old rice bags') },
      { k: 'ref', label: t('Reference no.'), ph: 'Voucher / Ref' },
      { k: 'desc', label: t('Description'), req: true },
      { k: 'amount', label: t('Amount (Ks)'), type: 'number', min: 0, req: true },
      { k: 'method', label: t('Received by'), type: 'select', placeholder: false, options: methodOptions(), def: cashMethodName(), help: t('Cash is used if nothing is chosen.') },
      { k: 'note', label: t('Note'), type: 'textarea', full: true },
    ],
    values: rec || {},
    onSubmit: (v) => {
      if (v.amount <= 0) return t('Amount must be more than 0');
      const e = rec || { id: uid(), no: nextNo('OIN') };
      Object.assign(e, { date: v.date, time: v.time, source: v.source, ref: v.ref, desc: v.desc, payer: e.payer || '', amount: num(v.amount), method: v.method || cashMethodName(), note: v.note });
      if (!rec) db.otherIncome.push(e);
      removePaymentsFor(e.id);
      addPayment({ date: e.date, dir: 'in', amount: e.amount, method: e.method, source: 'other-income', refId: e.id, party: e.source, note: e.desc });
      audit('income', rec ? 'update' : 'create', e.no + ' ' + money(e.amount), rec ? 'warn' : 'info'); toast(t('Saved'));
    },
  });
}

/* =================== TRANSPORT ADVANCES =================== */
const taRepaid = (a) => paidIn(a.id);
const taRemain = (a) => num(a.amount) - taRepaid(a);
function pageTransportAdvances() {
  const all = db.transportAdvances;
  const open = all.filter((a) => taRemain(a) > 0.5);
  const done = all.filter((a) => taRemain(a) <= 0.5);
  return pageHead(t('Transport advance management'), t('View transport fees the mill advanced when receiving paddy, and record when customers repay them.'), btn(t('New transport advance'), act(taForm), 'ghost')) +
   `<div class="card"><h3>${t('Transport advance summary')}</h3><div class="stats">
    ${statCard(t('Total advanced'), moneyOrDash(sum(all, 'amount')), nf(all.length) + ' ' + t('records'))}
    ${statCard(t('Remaining'), moneyOrDash(sum(open, taRemain)), nf(open.length) + ' ' + t('records outstanding'), '', open.length ? 'warn' : '')}
    ${statCard(t('Repaid'), moneyOrDash(sum(all, taRepaid)), nf(done.length) + ' ' + t('records completed'))}</div></div>
   <div class="card"><h3>${t('Transport advance list')}</h3>${table([
    { label: t('No.'), v: (a) => a.no }, { label: t('Date'), v: (a) => dt(a) },
    { label: t('Customer'), html: (a) => `<b>${esc(a.customer)}</b>${a.phone ? `<div class="muted sm">${esc(a.phone)}</div>` : ''}` },
    { label: t('Type'), v: (a) => t(a.type === 'cash' ? 'Cash advance' : 'Transport advance') },
    { label: t('Receipt'), v: (a) => a.receiptNo || '—' }, { label: t('Transporter'), v: (a) => a.vehicle },
    { label: t('Advanced'), num: true, v: (a) => money(a.amount) }, { label: t('Repaid'), num: true, v: (a) => money(taRepaid(a)) },
    { label: t('Remaining'), num: true, html: (a) => taRemain(a) > 0.5 ? `<span class="neg">${money(taRemain(a))}</span>` : badge(t('Completed'), 'ok') },
    { label: t('Days'), num: true, v: (a) => taRemain(a) > 0.5 ? daysBetween(a.date, today()) : '' },
    { label: t('Actions'), html: (a) => rowActions([taRemain(a) > 0.5 && [t('Record repayment'), () => payForm(t('Record repayment') + ' — ' + a.no, taRemain(a), (v) => { addPayment({ ...v, dir: 'in', source: 'transport-repay', refId: a.id, party: a.customer }); audit('transport', 'repay', a.no + ' ' + money(v.amount)); }, 'in'), 'primary'],
      Session.isOwner && !a.receiptId && [t('Delete'), () => confirmBox(t('Delete this record?'), () => { removePaymentsFor(a.id); all.splice(all.indexOf(a), 1); audit('transport', 'delete', a.no, 'warn'); saveDB(); render(); }), 'danger']]) }],
    all.slice().sort((a, b) => b.date.localeCompare(a.date)), { empty: t('There are no transport advances yet.') })}</div>`;
}
function taForm() {
  formModal({
    title: t('New transport advance'),
    fields: [
      { k: 'date', label: t('Date'), type: 'date', def: today(), req: true },
      { k: 'customer', label: t('Customer name'), req: true }, { k: 'phone', label: t('Phone') },
      { k: 'vehicle', label: t('Vehicle number / driver') },
      { k: 'amount', label: t('Amount (Ks)'), type: 'number', min: 0, req: true },
      { k: 'method', label: t('Payment method'), type: 'select', placeholder: false, options: methodOptions(), def: cashMethodName() },
      { k: 'note', label: t('Note'), full: true },
    ],
    onSubmit: (v) => {
      if (v.amount <= 0) return t('Amount must be more than 0');
      const a = { id: uid(), no: nextNo('TA'), date: v.date, customer: v.customer, phone: v.phone, vehicle: v.vehicle, amount: num(v.amount), note: v.note };
      db.transportAdvances.push(a);
      addPayment({ date: a.date, dir: 'out', amount: a.amount, method: v.method, source: 'transport-advance', refId: a.id, party: a.customer });
      audit('transport', 'create', a.no + ' ' + money(a.amount)); toast(t('Saved'));
    },
  });
}

/* =================== SALARY ADVANCES =================== */
const saRepaid = (a) => paidIn(a.id);
const saRemain = (a) => num(a.amount) - saRepaid(a);
function pageSalaryAdvances() {
  const s = ui('sal');
  const all = db.salaryAdvances;
  const open = all.filter((a) => saRemain(a) > 0.5);
  let rows = all.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (s.status === 'open') rows = rows.filter((a) => saRemain(a) > 0.5);
  if (s.status === 'done') rows = rows.filter((a) => saRemain(a) <= 0.5);
  if (s.q) { const q = s.q.toLowerCase(); rows = rows.filter((a) => (a.employee + a.no + (a.reason || '')).toLowerCase().includes(q)); }
  return pageHead(t('Salary advance management'), t('Manage advances to staff and workers and their repayments'), btn(t('New salary advance'), act(saForm))) +
   `<div class="card"><h3>${t('Salary advance summary')}</h3><div class="stats">
    ${statCard(t('Total advanced'), moneyOrDash(sum(all, 'amount')), nf(all.length) + ' ' + t('records'))}
    ${statCard(t('Remaining amount'), moneyOrDash(sum(open, saRemain)), nf(new Set(open.map((a) => a.employee)).size) + ' ' + t('staff outstanding'), '', open.length ? 'warn' : '')}
    ${statCard(t('Repaid'), moneyOrDash(sum(all, saRepaid)), nf(all.length - open.length) + ' ' + t('records completed'))}</div></div>
   <div class="card"><h3>${t('Salary advance list')}</h3><div class="filters">
    <select onchange="${act((e) => { s.status = e.target.value; render(); })}"><option value="">${t('Status')}: ${t('All')}</option><option value="open" ${s.status === 'open' ? 'selected' : ''}>${t('Outstanding')}</option><option value="done" ${s.status === 'done' ? 'selected' : ''}>${t('Fully repaid')}</option></select>
    <input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; render(); })}">
    <span class="muted">${t('Total advanced')}: <b>${money(sum(rows, 'amount'))}</b> · ${t('Remaining')}: <b>${money(sum(rows, saRemain))}</b></span></div>
   ${table([
    { label: t('No.'), v: (a) => a.no }, { label: t('Date'), v: (a) => dt(a) }, { label: t('Employee'), html: (a) => `<b>${esc(a.employee)}</b>${a.position ? `<div class="muted sm">${esc(a.position)}</div>` : ''}` },
    { label: t('Purpose'), v: (a) => a.reason }, { label: t('Advanced'), num: true, v: (a) => money(a.amount) }, { label: t('Repaid'), num: true, v: (a) => money(saRepaid(a)) },
    { label: t('Remaining'), num: true, html: (a) => saRemain(a) > 0.5 ? `<span class="neg">${money(saRemain(a))}</span>` : badge(t('Fully repaid'), 'ok') },
    { label: t('Actions'), html: (a) => rowActions([saRemain(a) > 0.5 && [t('Record repayment'), () => payForm(t('Record repayment') + ' — ' + a.no, saRemain(a), (v) => { addPayment({ ...v, dir: 'in', source: 'salary-repay', refId: a.id, party: a.employee }); audit('salary', 'repay', a.no + ' ' + money(v.amount)); }, 'in'), 'primary'],
      Session.isOwner && [t('Delete'), () => confirmBox(t('Delete this record?'), () => { removePaymentsFor(a.id); all.splice(all.indexOf(a), 1); audit('salary', 'delete', a.no, 'warn'); saveDB(); render(); }), 'danger']]) }],
    rows, { empty: t('No salary advance records yet. Click "New salary advance" to start.') })}</div>`;
}
function saForm() {
  formModal({
    title: t('New salary advance') + ' · ' + peekNo('ADV'),
    fields: [
      { k: 'date', label: t('Date'), type: 'datetime', req: true },
      { k: 'employee', label: t('Employee name'), req: true },
      { k: 'position', label: t('Employee ID (if any)') },
      { k: 'amount', label: t('Amount (Ks)'), type: 'number', min: 0, req: true },
      { k: 'reason', label: t('Purpose') },
      { k: 'note', label: t('Note'), type: 'textarea', full: true },
    ],
    onSubmit: (v) => {
      if (v.amount <= 0) return t('Amount must be more than 0');
      const a = { id: uid(), no: nextNo('ADV'), date: v.date, time: v.time, employee: v.employee, position: v.position, amount: num(v.amount), reason: v.reason, note: v.note };
      db.salaryAdvances.push(a);
      addPayment({ date: a.date, dir: 'out', amount: a.amount, method: cashMethodName(), source: 'salary-advance', refId: a.id, party: a.employee, note: a.reason });
      audit('salary', 'create', a.no + ' ' + a.employee + ' ' + money(a.amount)); toast(t('Saved'));
    },
  });
}
