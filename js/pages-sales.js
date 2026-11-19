/* SAN Ledger — sales, delivery orders, inventory */
const KIND_LABEL = { paddy: 'Paddy', rice: 'Rice', milling: 'Milling output', polishing: 'Polishing output' };
const isOwnKind = (k) => k === 'milling' || k === 'polishing';

const SALE_STAGES = [['milling', 'Milling output'], ['polishing', 'Polishing output'], ['rice', 'Rice (raw)'], ['other', 'Other']];
function saleItemOptions() {
  const seen = new Set(); const out = [];
  const push = (kind, item) => {
    const key = kind + '|' + item; if (seen.has(key)) return; seen.add(key);
    const st = stockOf(kind, item, 'mill');
    out.push({ v: key, l: `${item} · ${t(KIND_LABEL[kind])} · ${t('Stock')}: ${nf(st)}` });
  };
  stockBalances({ owner: 'mill' }).filter((b) => b.qty > 0).forEach((b) => push(b.kind, b.item));
  db.settings.outputs.milling.forEach((o) => push('milling', o.name));
  db.settings.outputs.polishing.forEach((o) => push('polishing', o.name));
  productOptions().forEach((p) => push('rice', p));
  return out.filter((o) => !o.v.startsWith('paddy|'));
}
const saleTotal = (s) => num(s.total);
const salePaid = (s) => paidIn(s.id);
const saleDue = (s) => saleTotal(s) - salePaid(s);
function saleDelivered(s, idx) {
  return sum(db.deliveries.filter((d) => d.refId === s.id).flatMap((d) => d.items.filter((it) => it.idx === idx)), 'bags');
}
function saleDeliveryStatus(s) {
  const tot = sum(s.items, 'bags'); const del = s.items.reduce((a, _, i) => a + saleDelivered(s, i), 0);
  if (del <= 0) return 'none'; if (del + 1e-9 < tot) return 'partial'; return 'full';
}
const DEL_LABEL = { none: 'Not delivered', partial: 'Partly delivered', full: 'Fully delivered' };

function pageSales() {
  const s = ui('sales');
  const m = thisMonth();
  const mon = db.sales.filter((x) => monthOf(x.date) === m);
  const credit = db.sales.filter((x) => saleDue(x) > 0.5);
  const monItems = mon.flatMap((x) => x.items);
  const t0 = today();
  let rows = db.sales.slice();
  if (s.tab === 'credit') rows = rows.filter((x) => saleDue(x) > 0.5);
  if (s.del) rows = rows.filter((x) => saleDeliveryStatus(x) === s.del);
  if (s.due) rows = rows.filter((x) => {
    if (!x.dueDate || saleDue(x) <= 0.5) return false;
    const d = daysBetween(t0, x.dueDate);
    return s.due === 'overdue' ? d < 0 : s.due === 'today' ? d === 0 : s.due === '7' ? d >= 0 && d <= 7 : d >= 0 && d <= 30;
  });
  if (s.from) rows = rows.filter((x) => x.date >= s.from);
  if (s.to) rows = rows.filter((x) => x.date <= s.to);
  if (s.q) { const q = s.q.toLowerCase(); rows = rows.filter((x) => (x.no + x.customer + x.items.map((i) => i.item).join()).toLowerCase().includes(q)); }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const cnt = (f) => db.sales.filter(f).length;
  const chip = (key, val, label, n) => `<button class="chip ${(s[key] || '') === val ? 'on' : ''}" onclick="${act(() => { s[key] = val; render(); })}">${esc(label)} <b>${n}</b></button>`;
  const cols = [
    { label: t('No.'), v: (x) => x.no },
    { label: t('Date'), v: (x) => dt(x) },
    { label: t('Customer'), html: (x) => `<b>${esc(x.customer)}</b>${x.phone ? `<div class="muted sm">${esc(x.phone)}</div>` : ''}` },
    { label: t('Items'), html: (x) => x.items.map((i) => `<div class="sm">${esc(i.item)} × ${nf(i.bags)} ${unitFor(i.kind)}</div>`).join('') },
    { label: t('Total'), num: true, v: (x) => money(x.total) },
    { label: t('Paid'), num: true, v: (x) => money(salePaid(x)) },
    { label: t('Credit balance'), num: true, html: (x) => saleDue(x) > 0.5 ? `<span class="neg">${money(saleDue(x))}</span>${x.dueDate ? `<div class="sm ${x.dueDate < t0 ? 'neg' : 'muted'}">${t('Due date')}: ${esc(x.dueDate)}</div>` : ''}` : badge(t('Paid in full'), 'ok') },
    { label: t('Delivery'), html: (x) => { const st = saleDeliveryStatus(x); return badge(t(DEL_LABEL[st]), st === 'full' ? 'ok' : st === 'partial' ? 'blue' : 'warn'); } },
    { label: t('Actions'), html: (x) => rowActions([
      saleDue(x) > 0.5 && [t('Receive payment'), () => payForm(t('Receive credit payment') + ' — ' + x.no, saleDue(x), (v) => { addPayment({ ...v, dir: 'in', source: 'sale', refId: x.id, party: x.customer }); audit('sale', 'payment', x.no + ' ' + money(v.amount)); }, 'in'), 'primary'],
      saleDeliveryStatus(x) !== 'full' && [t('Deliver'), () => saleDeliverForm(x)],
      [t('Voucher'), () => printSale(x)],
      Session.isOwner && [t('Delete'), () => confirmBox(t('Delete this sale? Its deliveries, stock movements and payments will also be removed.'), () => {
        removeMovesFor(x.id); removePaymentsFor(x.id); db.deliveries = db.deliveries.filter((d) => d.refId !== x.id);
        db.sales.splice(db.sales.indexOf(x), 1); audit('sale', 'delete', x.no, 'warn'); saveDB(); render();
      }), 'danger'],
    ]) },
  ];
  return pageHead(t('Sales summary'), '', btn(t('Add sale'), act(() => saleForm()))) +
    `<div class="stats">
     ${statCard(t('Sales records this month'), nf(mon.length), t('{n} records this month', { n: mon.length }), ICONS.receipt)}
     ${statCard(t('Sales revenue this month'), moneyOrDash(sum(mon, 'total')), t('Sales amount recorded this month'), ICONS.coin)}
     ${statCard(t('Sales quantity this month'), nf(sum(monItems, 'bags')), t('Own products') + ' - ' + nf(sum(monItems.filter((i) => isOwnKind(i.kind)), 'bags')) + ' · ' + t('Bought from others') + ' - ' + nf(sum(monItems.filter((i) => !isOwnKind(i.kind)), 'bags')), ICONS.bag)}
     ${statCard(t('Credit outstanding'), moneyOrDash(sum(credit, saleDue)), t('{n} sales on credit', { n: credit.length }), ICONS.check, credit.length ? 'warn' : '')}
    </div>
    <div class="card"><h3>${esc(t('Sales records'))}</h3><p class="muted">${esc(t('View past sales records.'))}</p>
     <div class="filters">${chip('tab', '', t('All'), db.sales.length)}${chip('tab', 'credit', t('Credit outstanding'), credit.length)}</div>
     <div class="filters"><span class="muted">${t('Delivery status')}:</span>${chip('del', '', t('All'), db.sales.length)}${['none', 'partial', 'full'].map((k) => chip('del', k, t(DEL_LABEL[k]), cnt((x) => saleDeliveryStatus(x) === k))).join('')}</div>
     <div class="filters"><span class="muted">${t('Credit due date')}:</span>${chip('due', '', t('All'), '')}${chip('due', 'overdue', t('Overdue'), '')}${chip('due', 'today', t('Due today'), '')}${chip('due', '7', t('Within next 7 days'), '')}${chip('due', '30', t('Within next 30 days'), '')}</div>
     <div class="filters"><input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; render(); })}">
      <span class="muted">${t('Select period')}:</span><input type="date" value="${s.from || ''}" onchange="${act((e) => { s.from = e.target.value; render(); })}"> – <input type="date" value="${s.to || ''}" onchange="${act((e) => { s.to = e.target.value; render(); })}"></div>
     ${table(cols, rows, { empty: t('No sales records yet. Click "Add sale" to sell products.') })}</div>`;
}

function saleForm() {
  const options = saleItemOptions();
  formModal({
    title: t('Add sale'),
    fields: [
      { k: 'date', label: t('Date'), type: 'datetime', req: true },
      { k: 'customer', label: t('Buyer name'), req: true, ph: t('Type a name or pick one') },
      { k: 'delivery', label: t('Delivery status'), type: 'select', placeholder: false, def: 'pending', options: [{ v: 'pending', l: t('Not delivered yet') }, { v: 'done', l: t('Delivered') }],
        help: t('If not delivered yet, you can mark it delivered later.') },
      { k: 'deliveryDate', label: t('Delivery date'), type: 'date', def: today(), show: (v) => v.delivery === 'done' },
      { k: 'deliveryNote', label: t('Delivery note'), show: (v) => v.delivery === 'done' },
      ...payStatusFields({ due: true }),
      { k: 'items', label: t('Items'), type: 'items', req: true, cols: [
        { k: 'stage', label: t('Stage'), type: 'select', options: () => SALE_STAGES.map(([v, l]) => ({ v, l: t(l) })) },
        { k: 'key', label: t('Product'), type: 'select', options },
        { k: 'name', label: t('Name (for Other)') },
        { k: 'bags', label: t('Quantity (bags / baskets)'), type: 'number' },
        { k: 'viss', label: t('Weight') + ' (' + weightUnitLabel() + ')', type: 'number' },
        { k: 'price', label: t('Unit price (Ks)'), type: 'number' }] },
      { k: 'note', label: t('Note'), type: 'textarea', full: true },
    ],
    onRowChange: (el) => {
      if (el.dataset.k.endsWith('.stage')) {
        const tr = el.closest('tr'); const sel = tr.querySelector('[data-k$=".key"]'); const nm = tr.querySelector('[data-k$=".name"]');
        const st = el.value; const list = options.filter((o) => !st || o.v.startsWith(st + '|'));
        sel.innerHTML = `<option value="">—</option>` + list.map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
        sel.disabled = st === 'other'; nm.disabled = st !== 'other'; if (st !== 'other') nm.value = ''; else sel.value = '';
        return;
      }
      if (!el.dataset.k.endsWith('.bags')) return;
      const tr = el.closest('tr'); const key = tr.querySelector('[data-k$=".key"]').value; const w = tr.querySelector('[data-k$=".viss"]');
      if (w && !w.value && key && key.includes('|')) w.value = fromViss(num(el.value) * bagVissFor(key.split('|')[1])) || '';
    },
    summary: (v) => {
      const tot = sum(v.items || [], (i) => num(i.bags) * num(i.price));
      const paid = v.payStatus === 'paid' ? tot : v.payStatus === 'partial' ? num(v.paid) : 0;
      return `<div class="sum-line">${t('Total sales amount')}: <b>${money(tot)}</b> · ${t('Remaining')}: <b>${money(tot - paid)}</b></div>`;
    },
    onSubmit: (v) => {
      const items = (v.items || []).filter((i) => (i.stage === 'other' ? i.name : i.key) && num(i.bags) > 0).map((i) => {
        const [kind, ...rest] = i.stage === 'other' ? ['other', i.name] : i.key.split('|'); const item = rest.join('|');
        return { kind, item, bags: num(i.bags), viss: toViss(i.viss), price: num(i.price), amount: num(i.bags) * num(i.price) };
      });
      if (!items.length) return t('Add at least one item');
      if (db.settings.stockCheck) {
        const need = {};
        items.filter((i) => i.kind !== 'other').forEach((i) => { const k = i.kind + '|' + i.item; need[k] = (need[k] || 0) + i.bags; });
        for (const k in need) {
          const [kind, item] = k.split('|');
          const undelivered = sum(db.sales.flatMap((x) => x.items.map((it, idx) => ({ it, x, idx }))).filter(({ it }) => it.kind === kind && it.item === item), ({ it, x, idx }) => it.bags - saleDelivered(x, idx));
          const avail = stockOf(kind, item, 'mill') - undelivered;
          if (need[k] > avail + 1e-9) return t('Not enough stock for {item}. Available: {n}', { item, n: nf(avail) });
        }
      }
      const total = sum(items, 'amount');
      const paid = paidFromStatus(v, total);
      if (typeof paid === 'string') return paid;
      const x = { id: uid(), no: nextNo('SAL'), date: v.date, time: v.time, customer: v.customer, items, discount: 0, total, dueDate: v.payStatus === 'paid' ? '' : v.dueDate, note: v.note };
      db.sales.push(x);
      addPayment({ date: x.date, dir: 'in', amount: paid, method: v.method, source: 'sale', refId: x.id, party: x.customer });
      if (v.delivery === 'done') createSaleDelivery(x, items.map((it, idx) => ({ idx, bags: it.bags })), { date: v.deliveryDate || x.date, note: v.deliveryNote });
      audit('sale', 'create', x.no + ' ' + x.customer + ' ' + money(total));
      toast(t('Saved'));
      setTimeout(() => printSale(x), 50);
    },
  });
}

function createSaleDelivery(x, lines, extra = {}) {
  const items = lines.filter((l) => num(l.bags) > 0).map((l) => { const it = x.items[l.idx]; const ratio = it.bags ? num(l.bags) / it.bags : 0; return { idx: l.idx, kind: it.kind, item: it.item, bags: num(l.bags), viss: it.viss * ratio }; });
  if (!items.length) return null;
  const d = { id: uid(), no: nextNo('DO'), date: extra.date || today(), type: 'sale', refId: x.id, refNo: x.no, name: x.customer, phone: x.phone, address: x.address, items, vehicle: extra.vehicle || '', note: extra.note || '' };
  db.deliveries.push(d);
  items.filter((it) => it.kind !== 'other').forEach((it) => addMove({ date: d.date, kind: it.kind, item: it.item, owner: 'mill', qty: -it.bags, viss: -it.viss, ref: d.no, refId: x.id, note: t('Sale delivery') + ' — ' + x.customer }));
  audit('delivery', 'create', d.no + ' ← ' + x.no);
  return d;
}

function saleDeliverForm(x) {
  const fields = [
    { k: 'date', label: t('Date'), type: 'date', def: today(), req: true },
    { k: 'vehicle', label: t('Vehicle number / driver') },
    ...x.items.map((it, idx) => { const rem = it.bags - saleDelivered(x, idx); return { k: 'q' + idx, label: `${it.item} — ${t('Remaining')}: ${nf(rem)}`, type: 'number', min: 0, def: rem, max: rem }; }),
    { k: 'note', label: t('Note'), full: true },
  ];
  formModal({
    title: t('Deliver') + ' — ' + x.no, fields,
    submitLabel: t('Create delivery order'),
    onSubmit: (v) => {
      const lines = x.items.map((it, idx) => ({ idx, bags: num(v['q' + idx]) }));
      for (const l of lines) if (l.bags > x.items[l.idx].bags - saleDelivered(x, l.idx) + 1e-9) return t('Quantity is more than remaining');
      if (db.settings.stockCheck) for (const l of lines) { const it = x.items[l.idx]; if (it.kind !== 'other' && l.bags > stockOf(it.kind, it.item, 'mill') + 1e-9) return t('Not enough stock for {item}. Available: {n}', { item: it.item, n: nf(stockOf(it.kind, it.item, 'mill')) }); }
      const d = createSaleDelivery(x, lines, v);
      if (!d) return t('Enter a quantity to deliver');
      toast(t('Saved')); setTimeout(() => printDelivery(d), 50);
    },
  });
}

function printSale(x) {
  printHTML(x.no, `<h3 class="c">${esc(t('Sales voucher'))}</h3>
  <p>${t('No.')}: <b>${esc(x.no)}</b> · ${t('Date')}: ${esc(x.date)}<br>${t('Customer')}: <b>${esc(x.customer)}</b> ${esc(x.phone || '')}<br>${esc(x.address || '')}</p>
  <table><tr><th>${t('Product')}</th><th class="n">${t('Qty')}</th><th class="n">${t('Price')}</th><th class="n">${t('Amount')}</th></tr>
  ${x.items.map((i) => `<tr><td>${esc(i.item)}${num(i.viss) ? `<br><small>${weight(i.viss)}</small>` : ''}</td><td class="n">${nf(i.bags)}</td><td class="n">${nf(i.price)}</td><td class="n">${nf(i.amount)}</td></tr>`).join('')}
  ${num(x.discount) ? `<tr><td colspan="3">${t('Discount (Ks)')}</td><td class="n">-${nf(x.discount)}</td></tr>` : ''}
  <tr class="tot"><td colspan="3">${t('Total')}</td><td class="n">${money(x.total)}</td></tr>
  <tr><td colspan="3">${t('Paid')}</td><td class="n">${money(salePaid(x))}</td></tr>
  <tr><td colspan="3">${t('Credit balance')}</td><td class="n">${money(saleDue(x))}</td></tr></table>
  ${x.dueDate && saleDue(x) > 0.5 ? `<p>${t('Credit due date')}: ${esc(x.dueDate)}</p>` : ''}
  <p class="c m">${t('Thank you!')}</p>`);
}

/* =================== DELIVERY ORDERS =================== */
function pageDeliveries() {
  const s = ui('do'); s.size = s.size || 10; s.page = s.page || 1;
  let rows = db.deliveries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  if (s.q) { const q = s.q.toLowerCase(); rows = rows.filter((d) => (d.no + d.refNo + d.name + d.items.map((i) => i.item).join() + (d.vehicle || '')).toLowerCase().includes(q)); }
  const pages = Math.max(1, Math.ceil(rows.length / s.size)); if (s.page > pages) s.page = pages;
  const start = (s.page - 1) * s.size; const view = rows.slice(start, start + s.size);
  const cols = [
    { label: t('Order no.'), v: (d) => d.no },
    { label: t('Date'), v: (d) => d.date },
    { label: t('Reference'), html: (d) => `${esc(d.refNo)} ${badge(t(d.type === 'sale' ? 'Sale' : 'Job'), d.type === 'sale' ? 'blue' : '')}` },
    { label: t('Name'), v: (d) => d.name },
    { label: t('Product details'), html: (d) => d.items.map((i) => `<div class="sm">${esc(i.item)}: ${nf(i.bags)} ${unitFor(i.kind)}${num(i.viss) ? ' · ' + weight(i.viss) : ''}</div>`).join('') },
    { label: t('Vehicle'), v: (d) => d.vehicle },
    { label: t('Actions'), html: (d) => rowActions([[t('Print'), () => printDelivery(d)],
      Session.isOwner && d.type === 'sale' && [t('Delete'), () => confirmBox(t('Delete this delivery order? Stock will be returned.'), () => {
        db.moves = db.moves.filter((m) => m.ref !== d.no); db.deliveries.splice(db.deliveries.indexOf(d), 1); audit('delivery', 'delete', d.no, 'warn'); saveDB(); render();
      }), 'danger']]) },
  ];
  return pageHead(t('Delivery orders'), t('View and print collection records and sale deliveries in one place.')) +
   `<div class="card"><div class="filters"><input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; s.page = 1; render(); })}"><span class="muted">${t('Total')} ${rows.length} ${t('records')}</span></div>
   ${table(cols, view, { empty: t('No delivery orders match your search.') })}
   <div class="pager"><span>${t('Records')} ${rows.length ? start + 1 : 0} - ${start + view.length} / ${rows.length}</span>
    <select onchange="${act((e) => { s.size = +e.target.value; s.page = 1; render(); })}">${[10, 25, 50].map((n) => `<option ${s.size === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <button class="btn ghost xs" ${s.page <= 1 ? 'disabled' : ''} onclick="${act(() => { s.page--; render(); })}">${t('Previous page')}</button>
    <span>${t('Page')} ${rows.length ? s.page : 0} / ${rows.length ? pages : 0}</span>
    <button class="btn ghost xs" ${s.page >= pages ? 'disabled' : ''} onclick="${act(() => { s.page++; render(); })}">${t('Next page')}</button></div></div>`;
}

function printDelivery(d) {
  printHTML(d.no, `<h3 class="c">${esc(t('Delivery order'))}</h3>
  <p>${t('Order no.')}: <b>${esc(d.no)}</b> · ${t('Date')}: ${esc(d.date)}<br>${t('Reference')}: ${esc(d.refNo)}<br>${t('Name')}: <b>${esc(d.name)}</b> ${esc(d.phone || '')}
  ${d.vehicle ? `<br>${t('Vehicle number / driver')}: ${esc(d.vehicle)}` : ''}</p>
  <table><tr><th>${t('Product')}</th><th class="n">${t('Qty')}</th><th class="n">${t('Weight')}</th></tr>
  ${d.items.map((i) => `<tr><td>${esc(i.item)}</td><td class="n">${nf(i.bags)} ${unitFor(i.kind)}</td><td class="n">${weight(i.viss)}</td></tr>`).join('')}
  <tr class="tot"><td>${t('Total')}</td><td class="n">${nf(sum(d.items, 'bags'))}</td><td></td></tr></table>
  ${d.note ? `<p>${esc(d.note)}</p>` : ''}
  <div class="sig"><span>${t('Issued by')}</span><span>${t('Received by')}</span></div>`);
}

/* =================== INVENTORY =================== */
function pageInventory() {
  const s = ui('inv'); s.tab = s.tab || 'summary';
  const tabs = [['summary', 'Stock summary'], ['mill', 'Mill-owned stock'], ['moves', 'Movement log']];
  const tabBar = `<div class="tabs">${tabs.map(([k, l]) => `<button class="${s.tab === k ? 'on' : ''}" onclick="${act(() => { s.tab = k; render(); })}">${esc(t(l))}</button>`).join('')}</div>`;
  const head = pageHead(t('Inventory management'), t('Track paddy and product stock levels and movements.'), btn(t('Add opening stock'), act(openingStockForm)));
  let body = '';
  const balTable = (filter, showOwner) => {
    const rows = stockBalances(filter).sort((a, b) => (a.ownerName + a.item).localeCompare(b.ownerName + b.item));
    return `<div class="muted sm">${t('Total balance')}: <b>${nf(sum(rows, 'qty'))}</b> ${unitFor(filter.kind)}</div>` + table([
      showOwner && { label: t('Customer'), v: (r) => r.ownerName },
      { label: t('Item'), v: (r) => r.item },
      { label: t('Quantity'), num: true, html: (r) => `<b class="${r.qty < 0 ? 'neg' : ''}">${nf(r.qty)}</b> ${unitFor(r.kind)}` },
      filter.kind !== 'paddy' && { label: t('Weight'), num: true, v: (r) => weight(r.viss) },
    ].filter(Boolean), rows, { empty: t('No stock yet.') });
  };
  if (s.tab === 'summary') {
    body = `<div class="grid-2col">
     <div class="card"><h3>${t('Paddy stock')} — ${t('Customer stock')}</h3>${balTable({ kind: 'paddy', owner: 'customer' }, true)}</div>
     <div class="card"><h3>${t('Paddy stock')} — ${t('Mill-owned stock')}</h3>${balTable({ kind: 'paddy', owner: 'mill' })}</div>
     <div class="card"><h3>${t('Rice stock')} — ${t('Customer stock')}</h3>${balTable({ kind: 'rice', owner: 'customer' }, true)}</div>
     <div class="card"><h3>${t('Rice stock')} — ${t('Mill-owned stock')}</h3>${balTable({ kind: 'rice', owner: 'mill' })}</div>
     <div class="card"><h3>${t('Milling output stock')} — ${t('Customer stock')}</h3>${balTable({ kind: 'milling', owner: 'customer' }, true)}</div>
     <div class="card"><h3>${t('Milling output stock')} — ${t('Mill-owned stock')}</h3>${balTable({ kind: 'milling', owner: 'mill' })}</div>
     <div class="card"><h3>${t('Polishing output stock')} — ${t('Customer stock')}</h3>${balTable({ kind: 'polishing', owner: 'customer' }, true)}</div>
     <div class="card"><h3>${t('Polishing output stock')} — ${t('Mill-owned stock')}</h3>${balTable({ kind: 'polishing', owner: 'mill' })}</div></div>`;
  } else if (s.tab === 'mill') {
    const rows = stockBalances({ owner: 'mill' }).sort((a, b) => a.kind.localeCompare(b.kind) || a.item.localeCompare(b.item));
    body = `<div class="card">${table([
      { label: t('Type'), v: (r) => t(KIND_LABEL[r.kind]) }, { label: t('Item'), v: (r) => r.item },
      { label: t('Quantity'), num: true, html: (r) => `<b>${nf(r.qty)}</b> ${unitFor(r.kind)}` }, { label: t('Weight'), num: true, v: (r) => r.kind === 'paddy' ? '—' : weight(r.viss) },
      { label: t('Actions'), html: (r) => Session.isOwner ? rowActions([[t('Adjust'), () => adjustStockForm(r)]]) : '' }], rows, { empty: t('No stock yet.') })}</div>`;
  } else {
    let rows = db.moves.slice().reverse();
    if (s.kind) rows = rows.filter((m) => m.kind === s.kind);
    if (s.q) { const q = s.q.toLowerCase(); rows = rows.filter((m) => (m.item + m.ref + m.ownerName + m.note).toLowerCase().includes(q)); }
    body = `<div class="card"><div class="filters"><input placeholder="${esc(t('Search'))}" value="${esc(s.q || '')}" onchange="${act((e) => { s.q = e.target.value; render(); })}">
     <select onchange="${act((e) => { s.kind = e.target.value; render(); })}"><option value="">${t('All')}</option>${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select></div>
     ${table([{ label: t('Date'), v: (m) => m.date }, { label: t('Type'), v: (m) => t(KIND_LABEL[m.kind]) }, { label: t('Item'), v: (m) => m.item },
      { label: t('Owner'), v: (m) => m.owner === 'mill' ? t('Mill') : m.ownerName },
      { label: t('In / Out'), num: true, html: (m) => `<b class="${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${nf(m.qty)}</b> ${unitFor(m.kind)}` },
      { label: t('Reference'), v: (m) => m.ref }, { label: t('Note'), v: (m) => m.note === 'output' ? t('Job output') : m.note }], rows.slice(0, 500), { empty: t('No movements yet.') })}</div>`;
  }
  return head + tabBar + body;
}

/* Draft-style opening stock: stage and ownership as option buttons. */
function openingStockForm() {
  const STAGES = { paddy: ['paddy', 'mill'], ricePurchase: ['rice', 'mill'], riceReceipt: ['rice', 'customer'], milling: ['milling', 'mill'], polishing: ['polishing', 'mill'] };
  formModal({
    title: t('Add opening stock'),
    fields: [
      { k: 'stage', label: t('Stage'), type: 'radio', def: 'paddy', full: true,
        options: [{ v: 'paddy', l: t('Paddy') }, { v: 'ricePurchase', l: t('Rice purchase') }, { v: 'riceReceipt', l: t('Rice receipt') }, { v: 'milling', l: t('Milling output') }, { v: 'polishing', l: t('Polishing output') }],
        onchange: (v, form) => { const o = form.querySelector(`[data-k="owner"][value="${STAGES[v.stage][1]}"]`); if (o) o.checked = true; } },
      { k: 'owner', label: t('Ownership'), type: 'radio', def: 'mill', options: [{ v: 'mill', l: t('Mill') }, { v: 'customer', l: t('Customer') }] },
      { k: 'ownerName', label: t('Customer name'), req: true, show: (v) => v.owner === 'customer' },
      { k: 'item', label: t('Variety / product'), type: 'select', req: true, options: [...new Set([...db.settings.varieties, ...productOptions()])] },
      { k: 'date', label: t('Record date'), type: 'datetime', req: true },
      { k: 'bags', label: t('Bags'), type: 'number', min: 0 },
      { k: 'baskets', label: t('Baskets'), type: 'number', min: 0, show: (v) => v.stage === 'paddy', help: t('1 bag = {n} baskets (change in Settings)', { n: db.settings.bagToBasket }) },
      { k: 'viss', label: t('Weight') + ' (' + weightUnitLabel() + ')', type: 'number', min: 0, show: (v) => v.stage !== 'paddy' },
      { k: 'note', label: t('Note'), type: 'textarea', full: true, ph: t('Optional') },
    ],
    submitLabel: t('Add opening stock'),
    onSubmit: (v) => {
      const kind = STAGES[v.stage][0];
      const qty = kind === 'paddy' ? (num(v.baskets) || num(v.bags) * num(db.settings.bagToBasket)) : num(v.bags);
      if (!(qty > 0)) return t('Amount must be more than 0');
      addMove({ date: v.date, time: v.time, kind, item: v.item, owner: v.owner, ownerName: v.owner === 'customer' ? v.ownerName : '', qty, viss: kind === 'paddy' ? 0 : toViss(v.viss), ref: t('Opening'), refId: 'opening', note: v.note || t('Opening stock') });
      audit('inventory', 'opening', v.item + ' ' + nf(qty)); toast(t('Saved'));
    },
  });
}

function adjustStockForm(r) {
  formModal({
    title: t('Adjust stock') + ' — ' + r.item,
    intro: t('Current') + ': <b>' + nf(r.qty) + '</b> ' + unitFor(r.kind),
    fields: [
      { k: 'actual', label: t('Actual counted quantity'), type: 'number', req: true, def: r.qty },
      { k: 'note', label: t('Reason'), req: true },
    ],
    onSubmit: (v) => {
      const diff = num(v.actual) - r.qty; if (!diff) return true;
      addMove({ kind: r.kind, item: r.item, owner: 'mill', qty: diff, ref: t('Adjustment'), refId: 'adjust', note: v.note });
      audit('inventory', 'adjust', r.item + ' ' + (diff > 0 ? '+' : '') + nf(diff), 'warn'); toast(t('Saved'));
    },
  });
}
