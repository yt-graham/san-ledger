/* SAN Ledger — purchases, receipts, jobs */

function methodOptions() { return db.settings.paymentMethods.map((m) => m.name); }
/* Payment status block shared by purchase, sale and expense forms: paid / partly paid / not paid yet. */
function payStatusFields(opts = {}) {
  return [
    { k: 'payStatus', label: t('Payment status'), type: 'select', placeholder: false, def: 'paid',
      options: [{ v: 'paid', l: t('Fully paid') }, { v: 'partial', l: t('Partly paid') }, { v: 'unpaid', l: t('Not paid yet') }] },
    { k: 'method', label: t('Payment method'), type: 'select', placeholder: false, req: true, options: methodOptions(), def: cashMethodName(), show: (v) => v.payStatus !== 'unpaid' },
    { k: 'paid', label: t('Amount paid (Ks)'), type: 'number', min: 0, req: true, show: (v) => v.payStatus === 'partial' },
    opts.due && { k: 'dueDate', label: t('Credit due date'), type: 'date', show: (v) => v.payStatus !== 'paid' },
  ].filter(Boolean);
}
function paidFromStatus(v, total) {
  if (v.payStatus === 'unpaid') return 0;
  if (v.payStatus === 'partial') {
    if (!(num(v.paid) > 0) || num(v.paid) >= total) return t('For partly paid, the amount paid must be more than 0 and less than the total.');
    return num(v.paid);
  }
  return total;
}
/* Variety picker with an "add new" tick box, like the draft. New names are saved to Settings. */
function varietyFields(label, current) {
  const list = db.settings.varieties.slice();
  if (current && !list.includes(current)) list.push(current);
  return [
    { k: 'variety', label, type: 'select', req: true, options: list, show: (v) => !v.newVariety },
    { k: 'varietyNew', label: t('New variety name'), req: true, show: (v) => !!v.newVariety },
    { k: 'newVariety', label: t('Add new variety'), type: 'checkbox' },
  ];
}
function pickVariety(v) {
  if (!v.newVariety) return v.variety;
  const name = String(v.varietyNew || '').trim();
  if (name && !db.settings.varieties.includes(name)) db.settings.varieties.push(name);
  return name;
}
function productOptions() {
  const s = new Set(['ဆန်']);
  db.settings.outputs.milling.forEach((o) => s.add(o.name));
  db.settings.outputs.polishing.forEach((o) => s.add(o.name));
  return [...s];
}
function bagVissFor(name) {
  const o = [...db.settings.outputs.milling, ...db.settings.outputs.polishing].find((x) => x.name === name);
  return o ? num(o.bagViss) : 0;
}
const paidOf = (id) => sum(paymentsFor(id).filter((p) => p.dir === (db.payments.find((x) => x.refId === id) || {}).dir), 'amount');
const paidOut = (id) => sum(paymentsFor(id).filter((p) => p.dir === 'out'), 'amount');
const paidIn = (id) => sum(paymentsFor(id).filter((p) => p.dir === 'in'), 'amount');

function payForm(title, max, onPay, dir = 'out') {
  formModal({
    title,
    intro: t('Remaining balance') + ': <b>' + money(max) + '</b>',
    fields: [
      { k: 'date', label: t('Date'), type: 'date', def: today(), req: true },
      { k: 'amount', label: t('Amount (Ks)'), type: 'number', def: max, req: true, min: 0 },
      { k: 'method', label: t('Payment method'), type: 'select', placeholder: false, options: methodOptions(), def: cashMethodName() },
      { k: 'note', label: t('Note') },
    ],
    submitLabel: dir === 'out' ? t('Record payment') : t('Record receipt'),
    onSubmit: (v) => {
      if (v.amount <= 0) return t('Amount must be more than 0');
      if (v.amount > max + 0.001) return t('Amount is more than the remaining balance');
      onPay(v); toast(t('Saved'));
    },
  });
}

/* =================== PURCHASES (paddy / rice) =================== */
function pagePurchases(kind) {
  const isP = kind === 'paddy';
  const list = isP ? db.purchases : db.ricePurchases;
  const m = thisMonth();
  const mon = list.filter((r) => monthOf(r.date) === m);
  const stock = sum(stockBalances({ kind: isP ? 'paddy' : 'rice', owner: 'mill' }), 'qty');
  const unpaid = list.filter((r) => num(r.total) - paidOut(r.id) > 0.5);
  const monUnpaid = mon.filter((r) => num(r.total) - paidOut(r.id) > 0.5);
  const payIds = new Set(list.map((r) => r.id));
  const pays = db.payments.filter((p) => payIds.has(p.refId)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

  const head = pageHead(t(isP ? 'Paddy purchase records' : 'Rice purchase records'),
    t(isP ? 'Track purchases, costs and remaining stock.' : 'Track rice purchases, costs and payment status.'),
    btn(t(isP ? 'Buy paddy' : 'Buy rice'), act(() => purchaseForm(kind))));
  const stats = `<div class="stats">
    ${statCard(t(isP ? 'Purchases this month' : 'Rice purchases this month'), nf(sum(mon, 'bags')), isP ? t('bags') + ' / ' + nf(sum(mon, 'baskets')) + ' ' + t('baskets') : t('bags') + ' / ' + weight(sum(mon, 'viss')), ICONS.basket)}
    ${statCard(t(isP ? 'Paddy in stock' : 'Rice in stock'), nf(stock), isP ? t('baskets') + ' · ' + t('mill-owned') : t('bags') + ' · ' + t('mill-owned'), ICONS.box)}
    ${statCard(t('Total cost'), moneyOrDash(sum(mon, 'total')), t('This month\'s purchases'), ICONS.coin)}
    ${statCard(t('Unpaid records'), nf(monUnpaid.length) + ' ' + t('records'), t('Owed this month') + ': ' + money(sum(monUnpaid, (r) => r.total - paidOut(r.id))), ICONS.check, monUnpaid.length ? 'warn' : '')}
  </div>`;
  const s = ui(kind + 'p');
  const q = (s.q || '').toLowerCase();
  const rows = list.filter((r) => (!q || (r.seller + r.no + (r.variety || r.product)).toLowerCase().includes(q)) && (!s.unpaid || num(r.total) - paidOut(r.id) > 0.5))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const cols = [
    { label: t('No.'), v: (r) => r.no },
    { label: t('Date'), v: (r) => dt(r) },
    { label: t('Seller'), html: (r) => `<b>${esc(r.seller)}</b>${r.transporter || r.phone ? `<div class="muted sm">${esc(r.transporter || r.phone)}</div>` : ''}` },
    { label: t(isP ? 'Paddy variety' : 'Product'), v: (r) => r.variety || r.product },
    { label: t('Bags'), num: true, v: (r) => nf(r.bags) },
    isP ? { label: t('Baskets'), num: true, v: (r) => nf(r.baskets) } : { label: t('Weight'), num: true, v: (r) => weight(r.viss) },
    { label: t('Price'), num: true, v: (r) => money(r.price) },
    { label: t('Total'), num: true, v: (r) => money(r.total) },
    { label: t('Paid'), num: true, v: (r) => money(paidOut(r.id)) },
    { label: t('Balance'), num: true, html: (r) => { const b = r.total - paidOut(r.id); return b > 0.5 ? `<span class="neg">${money(b)}</span>` : badge(t('Paid in full'), 'ok'); } },
    { label: t('Actions'), html: (r) => rowActions([
      num(r.total) - paidOut(r.id) > 0.5 && [t('Pay'), () => payForm(t('Pay seller') + ' — ' + r.no, r.total - paidOut(r.id), (v) => { addPayment({ ...v, dir: 'out', source: kind + '-purchase', refId: r.id, party: r.seller }); audit('purchase', 'payment', r.no + ' ' + money(v.amount)); })],
      [t('Print'), () => printPurchase(r, kind)],
      Session.isOwner && [t('Edit'), () => purchaseForm(kind, r)],
      Session.isOwner && [t('Delete'), () => confirmBox(t('Delete this record? Its stock and payments will also be removed.'), () => { removeMovesFor(r.id); removePaymentsFor(r.id); list.splice(list.indexOf(r), 1); audit('purchase', 'delete', r.no, 'warn'); saveDB(); render(); }), 'danger'],
    ]) },
  ];
  const filters = `<div class="filters"><input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; render(); })}">
    <label class="chk"><input type="checkbox" ${s.unpaid ? 'checked' : ''} onchange="${act((e) => { s.unpaid = e.target.checked; render(); })}"> ${esc(t('Unpaid only'))}</label></div>`;
  return head + stats +
    `<div class="card"><h3>${esc(t(isP ? 'Purchase list' : 'Rice purchase list'))}</h3>${filters}${table(cols, rows, { empty: t(isP ? 'No purchase records yet. Click "Buy paddy" to start.' : 'No rice purchase records yet. Click "Buy rice" to start.') })}</div>` +
    `<div class="card"><h3>${esc(t('Latest payment records'))}</h3>${table([
      { label: t('Date'), v: (p) => p.date }, { label: t('Seller'), v: (p) => p.party }, { label: t('Payment method'), v: (p) => p.method },
      { label: t('Amount'), num: true, v: (p) => money(p.amount) }, { label: t('Note'), v: (p) => p.note }], pays, { empty: t('No payment records yet.') })}</div>`;
}

function rowActions(items) {
  return `<div class="row-actions">${items.filter(Boolean).map(([label, fn, cls]) => `<button class="btn xs ${cls || 'ghost'}" onclick="${act(fn)}">${esc(label)}</button>`).join('')}</div>`;
}

function purchaseForm(kind, rec) {
  const isP = kind === 'paddy';
  const list = isP ? db.purchases : db.ricePurchases;
  const fields = [
    { k: 'date', label: t('Purchase date'), type: 'datetime', req: true },
    { k: 'seller', label: t('Seller name'), req: true, ph: t(isP ? 'e.g. Chindwin Company' : 'e.g. paddy trader') },
    { k: 'transporter', label: t('Transporter'), ph: t('Transporter name') },
    ...varietyFields(t(isP ? 'Paddy variety' : 'Rice variety'), rec && (rec.variety || rec.product)),
    isP ? { k: 'baskets', label: t('Quantity (baskets)'), type: 'number', min: 0, req: true, help: t('1 bag = {n} baskets (change in Settings)', { n: db.settings.bagToBasket }) }
      : { k: 'bags', label: t('Number of bags'), type: 'number', min: 0, req: true },
    isP ? { k: 'bags', label: t('Quantity (bags)'), type: 'number', min: 0,
      onchange: (v, form) => { const el = form.querySelector('[data-k=baskets]'); if (el && !el.dataset.touched) el.value = num(v.bags) * num(db.settings.bagToBasket) || ''; } }
      : { k: 'viss', label: t('Total weight') + ' (' + weightUnitLabel() + ')', type: 'number', min: 0 },
    { k: 'price', label: t(isP ? 'Price per basket (Ks)' : 'Price per bag (Ks)'), type: 'number', min: 0, req: true },
    { k: 'transport', label: t('Transport fee (Ks)'), type: 'number', min: 0 },
    { k: 'transportSeparate', label: t('Pay transport fee separately'), type: 'checkbox', help: t('Keep the transport fee apart from the purchase payment.'), show: (v) => num(v.transport) > 0 },
    ...(!rec ? payStatusFields() : []),
    { k: 'note', label: t('Note'), type: 'textarea', full: true },
  ];
  const goods = (v) => (isP ? num(v.baskets) : num(v.bags)) * num(v.price);
  const total = (v) => goods(v) + (v.transportSeparate ? 0 : num(v.transport));
  const values = rec ? { ...rec, viss: fromViss(rec.viss), variety: rec.variety || rec.product, transport: rec.transport ?? rec.extra } : {};
  const form = formModal({
    title: rec ? t('Edit') + ' — ' + rec.no : t(isP ? 'New paddy purchase' : 'New rice purchase') + ' · ' + peekNo(isP ? 'PUR' : 'RPU'),
    fields, values,
    summary: (v) => `<div class="sum-line">${t('Total cost')}: <b>${money(total(v))}</b>${v.transportSeparate && num(v.transport) ? ` · ${t('Transport fee')}: ${money(v.transport)}` : ''}</div>`,
    onSubmit: (v) => {
      const tot = total(v);
      const paid = rec ? 0 : paidFromStatus(v, tot);
      if (typeof paid === 'string') return paid;
      const variety = pickVariety(v);
      if (!variety) return t('Please fill in: {f}', { f: t('New variety name') });
      const r = rec || { id: uid(), no: nextNo(isP ? 'PUR' : 'RPU') };
      const sep = !!v.transportSeparate && num(v.transport) > 0;
      Object.assign(r, { date: v.date, time: v.time, seller: v.seller, transporter: v.transporter, bags: num(v.bags), price: num(v.price),
        transport: num(v.transport), transportSeparate: sep, extra: sep ? 0 : num(v.transport), total: tot, note: v.note });
      if (isP) Object.assign(r, { variety, baskets: num(v.baskets) });
      else Object.assign(r, { product: variety, viss: toViss(v.viss) });
      removeMovesFor(r.id);
      addMove(isP ? { date: r.date, kind: 'paddy', item: r.variety, owner: 'mill', qty: r.baskets, ref: r.no, refId: r.id, note: t('Purchase') + ' — ' + r.seller }
        : { date: r.date, kind: 'rice', item: r.product, owner: 'mill', qty: r.bags, viss: r.viss, ref: r.no, refId: r.id, note: t('Purchase') + ' — ' + r.seller });
      if (!rec) {
        list.push(r);
        addPayment({ date: r.date, dir: 'out', amount: paid, method: v.method, source: kind + '-purchase', refId: r.id, party: r.seller });
        if (sep) addPayment({ date: r.date, dir: 'out', amount: r.transport, method: v.payStatus === 'unpaid' ? cashMethodName() : v.method, source: 'purchase-transport', refId: r.id + ':t', party: r.transporter || r.seller, note: r.no });
        audit('purchase', 'create', r.no + ' ' + r.seller + ' ' + money(tot));
      } else {
        audit('purchase', 'update', r.no, 'warn');
      }
      toast(t('Saved'));
    },
  });
  form.querySelectorAll('[data-k=baskets]').forEach((el) => el.addEventListener('input', () => (el.dataset.touched = 1)));
}

function printPurchase(r, kind) {
  const isP = kind === 'paddy';
  printHTML(r.no, `<h3 class="c">${esc(t(isP ? 'Paddy purchase voucher' : 'Rice purchase voucher'))}</h3>
  <p>${t('No.')}: <b>${esc(r.no)}</b> &nbsp; ${t('Date')}: ${esc(r.date)}<br>${t('Seller')}: <b>${esc(r.seller)}</b> ${esc(r.phone || '')}${r.transporter ? '<br>' + t('Transporter') + ': ' + esc(r.transporter) : ''}</p>
  <table><tr><th>${t(isP ? 'Paddy variety' : 'Product')}</th><th class="n">${t('Bags')}</th><th class="n">${t(isP ? 'Baskets' : 'Weight')}</th><th class="n">${t('Price')}</th><th class="n">${t('Amount')}</th></tr>
  <tr><td>${esc(r.variety || r.product)}</td><td class="n">${nf(r.bags)}</td><td class="n">${isP ? nf(r.baskets) : weight(r.viss)}</td><td class="n">${money(r.price)}</td><td class="n">${money(r.total - num(r.extra))}</td></tr>
  ${num(r.extra) ? `<tr><td colspan="4">${t('Transport fee')}</td><td class="n">${money(r.extra)}</td></tr>` : ''}
  <tr class="tot"><td colspan="4">${t('Total')}</td><td class="n">${money(r.total)}</td></tr>
  <tr><td colspan="4">${t('Paid')}</td><td class="n">${money(paidOut(r.id))}</td></tr>
  <tr><td colspan="4">${t('Balance')}</td><td class="n">${money(r.total - paidOut(r.id))}</td></tr></table>
  <div class="sig"><span>${t('Seller signature')}</span><span>${t('Receiver signature')}</span></div>`);
}

/* =================== RECEIPTS (customer deposits) =================== */
function receiptUsed(r) {
  return sum(db.jobs.filter((j) => j.receiptId === r.id), 'qty');
}
function pageReceipts(kind) {
  const isP = kind === 'paddy';
  const list = isP ? db.receipts : db.riceReceipts;
  const s = ui(kind + 'r');
  const q = (s.q || '').toLowerCase();
  const rows = list.filter((r) => !q || (r.customer + r.no + (r.variety || r.product) + (r.vehicle || '')).toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const head = pageHead(t(isP ? 'Paddy receipt records' : 'Rice receipt records'),
    t(isP ? 'Manage customer deposits separately and assign them to jobs.' : 'Keep rice receipt records in order and track how they are used in jobs.'),
    btn(t('New receipt'), act(() => receiptForm(kind))));
  const mon = list.filter((r) => monthOf(r.date) === thisMonth());
  const custStock = sum(stockBalances({ kind: isP ? 'paddy' : 'rice', owner: 'customer' }), 'qty');
  const stats = `<div class="stats">
   ${statCard(t('Receipts this month'), nf(mon.length), nf(sum(mon, 'bags')) + ' ' + t('bags'), ICONS.clipboard)}
   ${statCard(t('Customer stock waiting'), nf(custStock), isP ? t('baskets') : t('bags'), ICONS.box)}
   ${isP ? statCard(t('Transport advances this month'), moneyOrDash(sum(mon, 'transport')), '', ICONS.car) : ''}
  </div>`;
  const cols = [
    { label: t('No.'), v: (r) => r.no },
    { label: t('Date'), v: (r) => dt(r) },
    { label: t('Customer'), html: (r) => `<b>${esc(r.customer)}</b>${r.phone ? `<div class="muted sm">${esc(r.phone)}</div>` : ''}${r.village ? `<div class="muted sm">${esc(r.village)}</div>` : ''}` },
    { label: t(isP ? 'Paddy variety' : 'Product'), v: (r) => r.variety || r.product },
    { label: t('Bags'), num: true, v: (r) => nf(r.bags) },
    isP ? { label: t('Baskets'), num: true, v: (r) => nf(r.baskets) } : { label: t('Weight'), num: true, v: (r) => weight(r.viss) },
    { label: t('Used in jobs'), num: true, v: (r) => nf(receiptUsed(r)) },
    { label: t('Remaining'), num: true, html: (r) => { const rem = (isP ? r.baskets : r.bags) - receiptUsed(r); return rem > 0 ? `<b>${nf(rem)}</b>` : badge(t('All used'), 'ok'); } },
    isP && { label: t('Vehicle / transport'), html: (r) => `${esc(r.vehicle || '')}${num(r.transport) ? `<div class="muted sm">${t('Advance')}: ${money(r.transport)}</div>` : ''}` },
    { label: t('Actions'), html: (r) => rowActions([
      (isP ? r.baskets : r.bags) - receiptUsed(r) > 0 && [t('Start job'), () => jobForm({ type: isP ? 'milling' : 'polishing', source: 'deposit', receiptId: r.id }), 'primary'],
      [t('Print'), () => printReceipt(r, kind)],
      Session.isOwner && [t('Edit'), () => receiptForm(kind, r)],
      Session.isOwner && [t('Delete'), () => {
        if (receiptUsed(r) > 0) return toast(t('This receipt is used in jobs. Delete those jobs first.'), 'err');
        confirmBox(t('Delete this record? Its stock and payments will also be removed.'), () => {
          removeMovesFor(r.id);
          db.transportAdvances.filter((x) => x.receiptId === r.id).forEach((ta) => { removePaymentsFor(ta.id); db.transportAdvances.splice(db.transportAdvances.indexOf(ta), 1); });
          list.splice(list.indexOf(r), 1); audit('receipt', 'delete', r.no, 'warn'); saveDB(); render();
        });
      }, 'danger'],
    ]) },
  ].filter(Boolean);
  return head + stats + `<div class="card"><h3>${esc(t(isP ? 'Paddy receipt list' : 'Rice receipt list'))}</h3>
   <div class="filters"><input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; render(); })}"></div>
   ${table(cols, rows, { empty: t('No receipt records yet.') })}</div>`;
}

function receiptForm(kind, rec) {
  const isP = kind === 'paddy';
  const list = isP ? db.receipts : db.riceReceipts;
  const advFields = (k, label) => !rec ? [
    { k, label: t(label + ' (Ks)'), type: 'number', min: 0 },
    { k: k + 'Date', label: t(label + ' date'), type: 'date', def: today(), show: (v) => num(v[k]) > 0 },
    { k: k + 'Method', label: t(label + ' payment method'), type: 'select', placeholder: false, options: methodOptions(), def: cashMethodName(), show: (v) => num(v[k]) > 0 },
  ] : [];
  const fields = [
    { k: 'customer', label: t('Depositor name'), req: true, ph: t('e.g. U Ba') },
    { k: 'transporter', label: t('Transporter') },
    ...varietyFields(t(isP ? 'Paddy variety' : 'Rice variety'), rec && (rec.variety || rec.product)),
    { k: 'date', label: t('Received date'), type: 'datetime', req: true },
    isP ? { k: 'baskets', label: t('Baskets (quantity)'), type: 'number', min: 0, req: true, help: t('1 bag = {n} baskets (change in Settings)', { n: db.settings.bagToBasket }) }
      : { k: 'bags', label: t('Bags (quantity)'), type: 'number', min: 0, req: true },
    isP ? { k: 'bags', label: t('Bags (quantity)'), type: 'number', min: 0, req: true,
      onchange: (v, form) => { const el = form.querySelector('[data-k=baskets]'); if (el && !el.dataset.touched) el.value = num(v.bags) * num(db.settings.bagToBasket) || ''; } }
      : { k: 'viss', label: t('Weight') + ' (' + weightUnitLabel() + ')', type: 'number', min: 0 },
    ...advFields('transport', 'Transport advance'),
    ...advFields('cashAdv', 'Cash advance'),
    { k: 'note', label: t('Note'), full: true },
  ];
  const form = formModal({
    title: rec ? t('Edit') + ' — ' + rec.no : t(isP ? 'New paddy receipt' : 'New rice receipt') + ' · ' + peekNo('REC'),
    fields, values: rec ? { ...rec, viss: fromViss(rec.viss), variety: rec.variety || rec.product, transporter: rec.transporter || rec.vehicle } : {},
    onSubmit: (v) => {
      if (rec && rec.customer !== v.customer && receiptUsed(rec) > 0) return t('This receipt is used in jobs. Delete those jobs first.');
      const variety = pickVariety(v);
      if (!variety) return t('Please fill in: {f}', { f: t('New variety name') });
      const r = rec || { id: uid(), no: nextNo('REC') };
      Object.assign(r, { date: v.date, time: v.time, customer: v.customer, transporter: v.transporter, vehicle: v.transporter, bags: num(v.bags), note: v.note });
      if (isP) Object.assign(r, { variety, baskets: num(v.baskets), transport: rec ? rec.transport : num(v.transport) });
      else Object.assign(r, { product: variety, viss: toViss(v.viss), transport: rec ? rec.transport : num(v.transport) });
      removeMovesFor(r.id);
      addMove({ date: r.date, kind: isP ? 'paddy' : 'rice', item: variety, owner: 'customer', ownerName: r.customer, qty: isP ? r.baskets : r.bags, viss: r.viss || 0, ref: r.no, refId: r.id, note: t('Customer deposit') });
      if (!rec) {
        list.push(r);
        [['transport', 'transport', 'transport-advance'], ['cashAdv', 'cash', 'customer-advance']].forEach(([k, type, source]) => {
          if (!(num(v[k]) > 0)) return;
          const a = { id: uid(), no: nextNo('TA'), type, date: v[k + 'Date'] || r.date, customer: r.customer, amount: num(v[k]), receiptId: r.id, receiptNo: r.no, vehicle: r.transporter, note: '' };
          db.transportAdvances.push(a);
          addPayment({ date: a.date, dir: 'out', amount: a.amount, method: v[k + 'Method'], source, refId: a.id, party: r.customer, note: r.no });
        });
        r.cashAdvance = num(v.cashAdv);
        audit('receipt', 'create', r.no + ' ' + r.customer);
      } else audit('receipt', 'update', r.no, 'warn');
      toast(t('Saved'));
    },
  });
  form.querySelectorAll('[data-k=baskets]').forEach((el) => el.addEventListener('input', () => (el.dataset.touched = 1)));
}

function printReceipt(r, kind) {
  const isP = kind === 'paddy';
  printHTML(r.no, `<h3 class="c">${esc(t(isP ? 'Paddy receipt voucher' : 'Rice receipt voucher'))}</h3>
  <p>${t('No.')}: <b>${esc(r.no)}</b> &nbsp; ${t('Date')}: ${esc(r.date)}<br>${t('Customer')}: <b>${esc(r.customer)}</b> ${esc(r.phone || '')} ${esc(r.village || '')}</p>
  <table><tr><th>${t(isP ? 'Paddy variety' : 'Product')}</th><th class="n">${t('Bags')}</th><th class="n">${t(isP ? 'Baskets' : 'Weight')}</th></tr>
  <tr><td>${esc(r.variety || r.product)}</td><td class="n">${nf(r.bags)}</td><td class="n">${isP ? nf(r.baskets) : weight(r.viss)}</td></tr></table>
  ${isP && r.vehicle ? `<p>${t('Vehicle number / driver')}: ${esc(r.vehicle)}</p>` : ''}
  ${isP && num(r.transport) ? `<p>${t('Transport fee advanced by mill (Ks)')}: <b>${money(r.transport)}</b></p>` : ''}
  <div class="sig"><span>${t('Customer signature')}</span><span>${t('Receiver signature')}</span></div>`);
}

/* =================== JOBS =================== */
const JOB_STATUS = ['received', 'drying', 'milling', 'polishing', 'settled', 'collected'];
const STATUS_LABEL = { received: 'Paddy received', drying: 'Drying', milling: 'Milling', polishing: 'Polishing', settled: 'Settled', collected: 'Collected' };
const TYPE_LABEL = { milling: 'Milling', polishing: 'Polishing', reprocess: 'Re-polishing' };
const SOURCE_LABEL = { deposit: 'Customer deposit', purchase: 'Mill purchase' };
function jobFlow(j) { return j.type === 'milling' ? ['received', 'drying', 'milling', 'settled', 'collected'] : ['received', 'polishing', 'settled', 'collected']; }
function jobFeePaid(j) { return paidIn(j.id); }
function jobOwner(j) { return j.source === 'deposit' ? 'customer' : 'mill'; }
function outputGroup(j) { return j.type === 'milling' ? 'milling' : 'polishing'; }

function pageJobs() {
  const s = ui('jobs');
  const q = (s.q || '').toLowerCase();
  const rows = db.jobs.filter((j) => (!q || (j.no + j.customer + j.item).toLowerCase().includes(q))
    && (!s.status || j.status === s.status) && (!s.source || j.source === s.source) && (!s.type || j.type === s.type))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const sel = (key, opts, label) => `<select onchange="${act((e) => { s[key] = e.target.value; render(); })}"><option value="">${esc(label)}: ${esc(t('All'))}</option>${opts.map(([v, l]) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select>`;
  const cols = [
    { label: t('Job no.'), v: (j) => j.no },
    { label: t('Date'), v: (j) => dt(j) },
    { label: t('Source'), html: (j) => badge(t(SOURCE_LABEL[j.source]), j.source === 'deposit' ? 'blue' : '') },
    { label: t('Job type'), v: (j) => t(TYPE_LABEL[j.type]) },
    { label: t('Depositor / seller'), v: (j) => j.customer || t('Mill') },
    { label: t('Variety / product'), v: (j) => j.item },
    { label: t('Quantity used'), num: true, v: (j) => nf(j.qty) + ' ' + unitFor(j.inputKind) },
    { label: t('Status'), html: (j) => badge(t(STATUS_LABEL[j.status]), j.status === 'collected' ? 'ok' : j.status === 'settled' ? 'blue' : 'warn') },
    { label: t('Outputs'), html: (j) => (j.outputs || []).length ? j.outputs.map((o) => `<div class="sm">${esc(o.product)}: ${nf(o.bags)} ${t('bags')}</div>`).join('') : '<span class="muted">—</span>' },
    { label: t('Service fee'), num: true, html: (j) => j.source === 'deposit' ? `${money(j.fee)}${num(j.fee) - jobFeePaid(j) > 0.5 ? `<div class="neg sm">${t('Due')}: ${money(j.fee - jobFeePaid(j))}</div>` : ''}` : '—' },
    { label: t('Actions'), html: (j) => jobActions(j) },
  ];
  return pageHead(t('Jobs'), t('Manage drying, milling and polishing jobs from purchases and customer deposits on this page.'), btn(t('New job'), act(() => jobStart()))) +
    `<div class="stats">${['received', 'drying', 'milling', 'polishing', 'settled', 'collected'].map((st) => statCard(t(STATUS_LABEL[st]), nf(db.jobs.filter((j) => j.status === st).length), '', '')).join('')}</div>` +
    `<div class="card"><h3>${esc(t('Job list'))}</h3><div class="filters">
     <input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; render(); })}">
     ${sel('status', JOB_STATUS.map((x) => [x, STATUS_LABEL[x]]), t('Status'))}
     ${sel('source', [['deposit', SOURCE_LABEL.deposit], ['purchase', SOURCE_LABEL.purchase]], t('Source'))}
     ${sel('type', Object.entries(TYPE_LABEL), t('Job type'))}
     <span class="muted">${t('Total jobs')}: ${rows.length}</span></div>
     ${table(cols, rows, { empty: t('No jobs found. Check your filters.') })}</div>`;
}

function jobActions(j) {
  const flow = jobFlow(j);
  const i = flow.indexOf(j.status);
  const next = flow[i + 1];
  const items = [];
  if (next && !['settled', 'collected'].includes(next)) items.push(['→ ' + t(STATUS_LABEL[next]), () => setJobStatus(j, next), 'primary']);
  if (j.status !== 'collected') items.push([t('Outputs'), () => jobOutputsForm(j)]);
  if (next === 'settled') items.push([t('Settle'), () => jobSettle(j), 'primary']);
  if (j.source === 'deposit' && num(j.fee) - jobFeePaid(j) > 0.5 && (j.status === 'settled' || j.status === 'collected')) {
    items.push([t('Receive fee'), () => payForm(t('Receive service fee') + ' — ' + j.no, j.fee - jobFeePaid(j), (v) => { addPayment({ ...v, dir: 'in', source: 'job-fee', refId: j.id, party: j.customer }); audit('job', 'fee', j.no + ' ' + money(v.amount)); }, 'in')]);
  }
  if (next === 'collected') items.push([t('Collect'), () => jobCollect(j), 'primary']);
  items.push([t('Print'), () => printJob(j)]);
  if (Session.isOwner) items.push([t('Delete'), () => confirmBox(t('Delete this job? Its stock movements and payments will also be removed.'), () => {
    removeMovesFor(j.id); removePaymentsFor(j.id);
    db.deliveries = db.deliveries.filter((d) => d.refId !== j.id);
    db.jobs.splice(db.jobs.indexOf(j), 1); audit('job', 'delete', j.no, 'warn'); saveDB(); render();
  }), 'danger']);
  return rowActions(items);
}

function setJobStatus(j, st) {
  j.status = st; (j.history = j.history || []).push({ status: st, at: new Date().toISOString() });
  audit('job', 'status', j.no + ' → ' + t(STATUS_LABEL[st])); saveDB(); render(); toast(t('Saved'));
}

function jobStart() { jobForm({ type: 'milling', source: 'deposit' }); }

/* One form like the draft: type, source, start date, variety, then the receipt/stock and quantity.
   Changing type, source or variety reopens the form so the lists below match the choice. */
function jobForm(pre) {
  pre = { type: 'milling', source: 'deposit', ...pre };
  if (pre.type === 'reprocess') pre.source = 'purchase';
  const owner = pre.source === 'deposit' ? 'customer' : 'mill';
  const inputKind = pre.type === 'milling' ? 'paddy' : 'rice';
  let items;
  if (pre.type === 'reprocess') {
    items = stockBalances({ owner: 'mill' }).filter((b) => ['rice', 'milling', 'polishing'].includes(b.kind) && b.qty > 0)
      .map((b) => ({ v: b.kind + '|' + b.item, l: `${b.item} · ${t(KIND_LABEL[b.kind])} · ${nf(b.qty)} ${unitFor(b.kind)}`, kind: b.kind, item: b.item, rem: b.qty }));
  } else if (owner === 'customer') {
    const list = inputKind === 'paddy' ? db.receipts : db.riceReceipts;
    items = list.map((r) => ({ r, rem: (inputKind === 'paddy' ? r.baskets : r.bags) - receiptUsed(r) })).filter((x) => x.rem > 0)
      .map(({ r, rem }) => ({ v: r.id, l: `${r.no} · ${r.customer} · ${r.variety || r.product} · ${nf(rem)} ${unitFor(inputKind)}`, kind: inputKind, item: r.variety || r.product, rem, r }));
  } else {
    items = stockBalances({ kind: inputKind, owner: 'mill' }).filter((b) => b.qty > 0)
      .map((b) => ({ v: b.kind + '|' + b.item, l: `${b.item} · ${nf(b.qty)} ${unitFor(inputKind)}`, kind: b.kind, item: b.item, rem: b.qty }));
  }
  if (pre.receiptId && !pre.variety) { const it = items.find((i) => i.v === pre.receiptId); if (it) pre.variety = it.item; }
  const reopen = (v) => { closeModal(); setTimeout(() => jobForm({ ...pre, ...v, receiptId: v.src || pre.receiptId }), 0); };
  const pickList = owner === 'customer' && pre.variety ? items.filter((i) => i.item === pre.variety) : items;
  const emptyMsg = t(pre.type === 'reprocess' ? 'Re-polishing can only start from mill stock.' : owner === 'customer' ? 'No customer stock available. Record a receipt first.' : 'No mill-owned stock available. Record a purchase first.');
  const fields = [
    { k: 'type', label: t('Job type'), type: 'select', placeholder: false, options: Object.entries(TYPE_LABEL).map(([v, l]) => ({ v, l: t(l) })), onchange: reopen },
    { k: 'source', label: t('Job source'), type: 'select', placeholder: false, onchange: reopen,
      options: pre.type === 'reprocess' ? [{ v: 'purchase', l: t(SOURCE_LABEL.purchase) }] : [{ v: 'deposit', l: t(SOURCE_LABEL.deposit) }, { v: 'purchase', l: t(SOURCE_LABEL.purchase) }] },
    (pre.type === 'reprocess' || !items.length) && { k: 'msg', type: 'info', html: `<p class="muted">${esc(emptyMsg)}</p>` },
    { k: 'date', label: t('Job start date'), type: 'datetime', req: true },
    pre.type === 'reprocess'
      ? { k: 'src', label: t('Input for re-polishing'), type: 'select', req: true, options: items.map((i) => ({ v: i.v, l: i.l })), full: true }
      : owner === 'customer'
        ? { k: 'variety', label: t(pre.type === 'milling' ? 'Paddy variety' : 'Rice variety'), type: 'select', placeholder: false, options: [{ v: '', l: t('All') }, ...[...new Set(items.map((i) => i.item))]], onchange: reopen }
        : { k: 'src', label: t(pre.type === 'milling' ? 'Paddy variety' : 'Rice variety'), type: 'select', req: true, options: items.map((i) => ({ v: i.v, l: i.l })) },
    owner === 'customer' && pre.type !== 'reprocess' && { k: 'src', label: t('Receipt'), type: 'select', req: true, options: pickList.map((i) => ({ v: i.v, l: i.l })), def: pre.receiptId, full: true },
    { k: 'qty', label: t('Quantity to use') + ' (' + unitFor(inputKind) + ')', type: 'number', min: 0, req: true },
    owner === 'customer' && { k: 'fee', label: t('Service fee (Ks)'), type: 'number', min: 0, help: t('Milling/polishing charge to the customer.') },
    { k: 'note', label: t('Note'), type: 'textarea', full: true },
  ].filter(Boolean);
  const pick = (v) => items.find((i) => i.v === v.src);
  formModal({
    title: t('Create new job'),
    fields, values: pre,
    submitLabel: t('Create job'),
    summary: (v) => pick(v) ? `<div class="sum-line">${t('Available')}: <b>${nf(pick(v).rem)}</b> ${unitFor(pick(v).kind)}</div>` : '',
    onSubmit: (v) => {
      const it = pick(v);
      if (!it) return emptyMsg;
      if (num(v.qty) <= 0) return t('Amount must be more than 0');
      if (num(v.qty) > it.rem + 1e-9) return t('Quantity is more than available stock');
      const j = { id: uid(), no: nextNo('JOB'), date: v.date, time: v.time, type: v.type, source: pre.source, inputKind: it.kind, qty: num(v.qty), fee: num(v.fee), note: v.note, status: 'received', outputs: [], history: [{ status: 'received', at: new Date().toISOString() }] };
      if (owner === 'customer') Object.assign(j, { receiptId: it.r.id, receiptNo: it.r.no, customer: it.r.customer, phone: it.r.phone, item: it.item });
      else Object.assign(j, { customer: '', item: it.item });
      addMove({ date: j.date, kind: it.kind, item: j.item, owner, ownerName: j.customer, qty: -j.qty, ref: j.no, refId: j.id, note: t('Used in job') });
      db.jobs.push(j); audit('job', 'create', j.no + ' ' + (j.customer || t('Mill')) + ' ' + j.item);
      toast(t('Saved'));
    },
  });
}

function jobOutputsForm(j) {
  const group = outputGroup(j);
  const products = db.settings.outputs[group].map((o) => o.name);
  const defRows = (j.outputs && j.outputs.length) ? j.outputs.map((o) => ({ ...o, viss: fromViss(o.viss) })) : db.settings.outputs[group].filter((o) => o.isDefault).map((o) => ({ product: o.name }));
  formModal({
    title: t('Record outputs') + ' — ' + j.no,
    intro: `${esc(j.item)} · ${nf(j.qty)} ${unitFor(j.inputKind)}`,
    fields: [{ k: 'outputs', label: t('Outputs'), type: 'items', cols: [
      { k: 'product', label: t('Product'), type: 'select', options: products },
      { k: 'bags', label: t('Bags'), type: 'number' },
      { k: 'viss', label: t('Weight') + ' (' + weightUnitLabel() + ')', type: 'number' }] }],
    values: { outputs: defRows },
    onRowChange: (el, form) => {
      if (!el.dataset.k.endsWith('.bags')) return;
      const tr = el.closest('tr'); const p = tr.querySelector('[data-k$=".product"]').value; const w = tr.querySelector('[data-k$=".viss"]');
      if (w && !w.value) w.value = fromViss(num(el.value) * bagVissFor(p)) || '';
    },
    summary: (v) => { const totBags = sum(v.outputs || [], 'bags'); return `<div class="sum-line">${t('Total')}: <b>${nf(totBags)}</b> ${t('bags')}${j.inputKind === 'paddy' && j.qty ? ` · ${t('Yield')}: <b>${nf(totBags / j.qty * 100)}%</b> ${t('bags per 100 baskets')}` : ''}</div>`; },
    onSubmit: (v) => {
      j.outputs = (v.outputs || []).filter((o) => o.product && (num(o.bags) > 0 || num(o.viss) > 0)).map((o) => ({ product: o.product, bags: num(o.bags), viss: toViss(o.viss) }));
      // replace output moves (positive ones) for this job
      db.moves = db.moves.filter((m) => !(m.refId === j.id && m.qty > 0 && m.note === 'output'));
      j.outputs.forEach((o) => addMove({ date: today(), kind: group, item: o.product, owner: jobOwner(j), ownerName: j.customer, qty: o.bags, viss: o.viss, ref: j.no, refId: j.id, note: 'output' }));
      audit('job', 'outputs', j.no); toast(t('Saved'));
    },
  });
}

function jobSettle(j) {
  if (!(j.outputs || []).length) { toast(t('Record the outputs before settling.'), 'err'); jobOutputsForm(j); return; }
  if (j.source !== 'deposit') { setJobStatus(j, 'settled'); return; }
  const due = num(j.fee) - jobFeePaid(j);
  formModal({
    title: t('Settle job') + ' — ' + j.no,
    intro: `${esc(j.customer)} · ${t('Service fee')}: <b>${money(j.fee)}</b> · ${t('Due')}: <b>${money(due)}</b>`,
    fields: [
      { k: 'fee', label: t('Service fee (Ks)'), type: 'number', min: 0, def: j.fee },
      { k: 'amount', label: t('Amount received now (Ks)'), type: 'number', min: 0, def: due },
      { k: 'method', label: t('Payment method'), type: 'select', placeholder: false, options: methodOptions(), def: cashMethodName() },
    ],
    submitLabel: t('Settle'),
    onSubmit: (v) => {
      j.fee = num(v.fee);
      if (num(v.amount) > j.fee - jobFeePaid(j) + 0.001) return t('Amount is more than the remaining balance');
      addPayment({ date: today(), dir: 'in', amount: v.amount, method: v.method, source: 'job-fee', refId: j.id, party: j.customer });
      j.status = 'settled'; j.history.push({ status: 'settled', at: new Date().toISOString() });
      audit('job', 'settle', j.no + ' ' + money(v.amount)); toast(t('Saved'));
    },
  });
}

function jobCollect(j) {
  if (j.source !== 'deposit') {
    confirmBox(t('Mark this job as finished? The outputs are already in mill stock.'), () => setJobStatus(j, 'collected'), false);
    return;
  }
  formModal({
    title: t('Customer collection') + ' — ' + j.no,
    intro: t('A delivery order will be created and the outputs removed from customer stock.'),
    fields: [
      { k: 'date', label: t('Date'), type: 'date', def: today(), req: true },
      { k: 'vehicle', label: t('Vehicle number / driver') },
      { k: 'note', label: t('Note') },
    ],
    submitLabel: t('Collect'),
    onSubmit: (v) => {
      const group = outputGroup(j);
      const items = j.outputs.map((o) => ({ item: o.product, kind: group, bags: o.bags, viss: o.viss }));
      const d = { id: uid(), no: nextNo('DO'), date: v.date, type: 'job', refId: j.id, refNo: j.no, name: j.customer, phone: j.phone, items, vehicle: v.vehicle, note: v.note };
      db.deliveries.push(d);
      items.forEach((it) => addMove({ date: v.date, kind: group, item: it.item, owner: 'customer', ownerName: j.customer, qty: -it.bags, viss: -it.viss, ref: d.no, refId: j.id, note: t('Collected by customer') }));
      j.status = 'collected'; j.history.push({ status: 'collected', at: new Date().toISOString() });
      audit('job', 'collect', j.no + ' → ' + d.no); toast(t('Saved'));
      setTimeout(() => printDelivery(d), 50);
    },
  });
}

function printJob(j) {
  printHTML(j.no, `<h3 class="c">${esc(t('Job voucher'))}</h3>
   <p>${t('Job no.')}: <b>${esc(j.no)}</b> · ${t('Date')}: ${esc(j.date)}<br>${t('Customer')}: <b>${esc(j.customer || t('Mill'))}</b> ${esc(j.phone || '')}<br>
   ${t('Job type')}: ${esc(t(TYPE_LABEL[j.type]))} · ${t('Status')}: ${esc(t(STATUS_LABEL[j.status]))}</p>
   <table><tr><th>${t('Variety / product')}</th><th class="n">${t('Quantity used')}</th></tr><tr><td>${esc(j.item)}</td><td class="n">${nf(j.qty)} ${unitFor(j.inputKind)}</td></tr></table>
   <table><tr><th>${t('Outputs')}</th><th class="n">${t('Bags')}</th><th class="n">${t('Weight')}</th></tr>
   ${(j.outputs || []).map((o) => `<tr><td>${esc(o.product)}</td><td class="n">${nf(o.bags)}</td><td class="n">${weight(o.viss)}</td></tr>`).join('')}</table>
   ${j.source === 'deposit' ? `<p>${t('Service fee')}: <b>${money(j.fee)}</b> · ${t('Paid')}: ${money(jobFeePaid(j))} · ${t('Due')}: ${money(j.fee - jobFeePaid(j))}</p>` : ''}
   <div class="sig"><span>${t('Customer signature')}</span><span>${t('Mill signature')}</span></div>`);
}
