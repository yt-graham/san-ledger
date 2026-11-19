/* SAN Ledger — UI helpers */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* translation: English source string -> Burmese when lang = my */
function t(s, vars) {
  let out = curLang() === 'my' && I18N_MY[s] ? I18N_MY[s] : s;
  if (vars) for (const k in vars) out = out.split('{' + k + '}').join(vars[k]);
  return out;
}
const MY_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
function nf(n, dec = 0) {
  const v = num(n);
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dec || 2 });
}
const money = (n) => nf(Math.round(num(n))) + ' ' + t('Ks');
const moneyOrDash = (n) => (num(n) ? money(n) : '—');
function weight(viss) {
  if (!num(viss)) return '—';
  return db.settings.weightUnit === 'lb' ? nf(num(viss) * 3.6) + ' ' + t('lb') : nf(viss) + ' ' + t('viss');
}
const weightUnitLabel = () => (db.settings.weightUnit === 'lb' ? t('lb') : t('viss'));
const toViss = (v) => (db.settings.weightUnit === 'lb' ? num(v) / 3.6 : num(v));
const fromViss = (v) => (db.settings.weightUnit === 'lb' ? num(v) * 3.6 : num(v));
const nowLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
/* Records keep date (YYYY-MM-DD) and time (HH:MM) separately so date filters keep working. */
const dt = (r) => r.date + (r.time ? ' ' + r.time : '');
const unitFor = (kind) => (kind === 'paddy' ? t('baskets') : t('bags'));

/* ---------- action registry (inline handlers) ---------- */
const ACT = {};
let actSeq = 0;
function act(fn) { const id = 'a' + (++actSeq); ACT[id] = fn; return `ACT.${id}(event)`; }
function resetActs() { for (const k in ACT) delete ACT[k]; }

/* ---------- toast ---------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ---------- modal ---------- */
function openModal(html, opts = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">${html}</div>`;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  const first = wrap.querySelector('input:not([type=hidden]),select,textarea');
  if (first) first.focus();
}
function closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); }

function confirmBox(message, onYes, danger = true) {
  openModal(`<h3>${esc(t('Please confirm'))}</h3><p class="muted">${esc(message)}</p>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">${t('Cancel')}</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" onclick="${act(() => { closeModal(); onYes(); })}">${t('Confirm')}</button></div>`);
}

/* ---------- form engine ----------
 field: {k,label,type:text|number|date|select|textarea|checkbox|items|info, options:[v]|[{v,l}], req, min, step, help, cols:[subfields], show:(vals)=>bool, onchange}
*/
function optList(options) { return (options || []).map((o) => (typeof o === 'object' ? o : { v: o, l: o })); }

function fieldHTML(f, val) {
  const id = 'f_' + f.k;
  const lab = `<label for="${id}">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ''}</label>`;
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
  const common = `id="${id}" name="${f.k}" ${f.req ? 'required' : ''} data-k="${f.k}"`;
  let input = '';
  switch (f.type) {
    case 'select':
      input = `<select ${common}>${f.placeholder !== false ? `<option value="">${t('— Select —')}</option>` : ''}${optList(f.options).map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(val ?? '') ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
      break;
    case 'textarea': input = `<textarea ${common} rows="2">${esc(val ?? '')}</textarea>`; break;
    case 'checkbox': return `<div class="field check ${f.full ? 'full' : ''}" data-wrap="${f.k}"><label><input type="checkbox" ${common} ${val ? 'checked' : ''}> ${esc(f.label)}</label>${help}</div>`;
    case 'radio': return `<div class="field ${f.full ? 'full' : ''}" data-wrap="${f.k}"><label>${esc(f.label)}</label><div class="radios">${optList(f.options).map((o) => `<label class="radio"><input type="radio" name="${f.k}" data-k="${f.k}" value="${esc(o.v)}" ${String(o.v) === String(val ?? '') ? 'checked' : ''}> ${esc(o.l)}</label>`).join('')}</div>${help}</div>`;
    case 'info': return `<div class="field full info" data-wrap="${f.k}" id="${id}">${f.html || ''}</div>`;
    case 'items': return itemsHTML(f, val || []);
    default:
      input = `<input type="${f.type === 'datetime' ? 'datetime-local' : f.type || 'text'}" ${common} value="${esc(val ?? '')}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.type === 'number' ? `step="${f.step || 'any'}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`;
  }
  return `<div class="field ${f.full ? 'full' : ''}" data-wrap="${f.k}">${lab}${input}${help}</div>`;
}

function itemRowHTML(f, row, i) {
  return `<tr data-row="${i}">${f.cols.map((c) => {
    const v = row[c.k] ?? '';
    const name = `${f.k}.${i}.${c.k}`;
    if (c.type === 'select') return `<td><select name="${name}" data-k="${name}">${`<option value="">—</option>`}${optList(typeof c.options === 'function' ? c.options() : c.options).map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></td>`;
    return `<td><input name="${name}" data-k="${name}" type="${c.type || 'text'}" ${c.type === 'number' ? 'step="any" min="0"' : ''} value="${esc(v)}"></td>`;
  }).join('')}<td><button type="button" class="icon-btn" data-delrow="${i}" title="${t('Remove')}">✕</button></td></tr>`;
}
function itemsHTML(f, rows) {
  if (!rows.length) rows = [{}];
  return `<div class="field full" data-wrap="${f.k}"><label>${esc(f.label)}</label>
  <div class="items-wrap"><table class="items" data-items="${f.k}"><thead><tr>${f.cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
  <tbody>${rows.map((r, i) => itemRowHTML(f, r, i)).join('')}</tbody></table></div>
  <button type="button" class="btn ghost sm" data-addrow="${f.k}">+ ${t('Add row')}</button></div>`;
}

function readForm(form, fields) {
  const vals = {};
  for (const f of fields) {
    if (f.type === 'info') continue;
    if (f.type === 'items') {
      const rows = [];
      form.querySelectorAll(`table[data-items="${f.k}"] tbody tr`).forEach((tr) => {
        const r = {}; let any = false;
        f.cols.forEach((c) => {
          const el = tr.querySelector(`[data-k$=".${c.k}"]`);
          let v = el ? el.value : '';
          if (c.type === 'number') v = v === '' ? '' : num(v);
          if (v !== '' && v !== 0) any = true;
          r[c.k] = v;
        });
        if (any) rows.push(r);
      });
      vals[f.k] = rows; continue;
    }
    const el = form.querySelector(`[data-k="${f.k}"]`);
    if (!el) continue;
    if (f.type === 'radio') { const c = form.querySelector(`[data-k="${f.k}"]:checked`); vals[f.k] = c ? c.value : ''; continue; }
    if (f.type === 'datetime') { const x = el.value || ''; vals[f.k] = x.slice(0, 10); vals.time = x.slice(11, 16); continue; }
    if (f.type === 'checkbox') vals[f.k] = el.checked;
    else if (f.type === 'number') vals[f.k] = el.value === '' ? '' : num(el.value);
    else vals[f.k] = el.value.trim();
  }
  return vals;
}

/* formModal({title, fields, values, submitLabel, onSubmit(vals) -> true|string(error), summary(vals)->html, wide}) */
function formModal(cfg) {
  const fields = cfg.fields;
  const vals0 = cfg.values || {};
  openModal(`<form class="form" novalidate>
    <div class="modal-head"><h3>${esc(cfg.title)}</h3><button type="button" class="icon-btn" onclick="closeModal()">✕</button></div>
    ${cfg.intro ? `<p class="muted">${cfg.intro}</p>` : ''}
    <div class="grid2">${fields.map((f) => fieldHTML(f, f.type === 'datetime' ? (vals0[f.k] ? vals0[f.k] + 'T' + (vals0.time || '00:00') : nowLocal()) : vals0[f.k] ?? f.def)).join('')}</div>
    <div class="form-summary"></div>
    <div class="form-error"></div>
    <div class="modal-actions"><button type="button" class="btn ghost" onclick="closeModal()">${t('Cancel')}</button>
      <button type="submit" class="btn primary">${esc(cfg.submitLabel || t('Save'))}</button></div>
  </form>`, { wide: cfg.wide || fields.some((f) => f.type === 'items') });
  const form = document.querySelector('#modal form');
  const refresh = () => {
    const v = readForm(form, fields);
    fields.forEach((f) => {
      const w = form.querySelector(`[data-wrap="${f.k}"]`);
      if (w && f.show) w.style.display = f.show(v) ? '' : 'none';
      if (f.type === 'info' && f.render) { const el = form.querySelector(`#f_${f.k}`); if (el) el.innerHTML = f.render(v); }
    });
    if (cfg.summary) form.querySelector('.form-summary').innerHTML = cfg.summary(v) || '';
  };
  form.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const f = fields.find((x) => x.k === k);
    if (f && f.onchange) f.onchange(readForm(form, fields), form);
    refresh();
  });
  form.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    const f = fields.find((x) => x.k === k);
    if (f && f.onchange) f.onchange(readForm(form, fields), form);
    if (cfg.onRowChange && k && k.includes('.')) cfg.onRowChange(e.target, form);
    refresh();
  });
  form.addEventListener('click', (e) => {
    const add = e.target.dataset.addrow;
    if (add) {
      const f = fields.find((x) => x.k === add);
      const tb = form.querySelector(`table[data-items="${add}"] tbody`);
      const i = tb.children.length + Date.now() % 1000;
      tb.insertAdjacentHTML('beforeend', itemRowHTML(f, {}, i));
      refresh();
    }
    if (e.target.dataset.delrow !== undefined) {
      const tr = e.target.closest('tr'); const tb = tr.parentElement;
      if (tb.children.length > 1) tr.remove(); else tr.querySelectorAll('input,select').forEach((x) => (x.value = ''));
      refresh();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = readForm(form, fields);
    for (const f of fields) {
      const visible = !f.show || f.show(v);
      if (f.req && visible && (v[f.k] === '' || v[f.k] === undefined || (Array.isArray(v[f.k]) && !v[f.k].length))) {
        form.querySelector('.form-error').textContent = t('Please fill in: {f}', { f: f.label });
        return;
      }
    }
    const res = cfg.onSubmit(v);
    if (typeof res === 'string') { form.querySelector('.form-error').textContent = res; return; }
    if (res !== false) { saveDB(); closeModal(); render(); }
  });
  refresh();
  return form;
}

/* ---------- table ---------- */
function table(cols, rows, opts = {}) {
  if (!rows.length) return `<div class="empty">${esc(opts.empty || t('No records yet.'))}</div>`;
  return `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('')}</tbody>
  ${opts.foot ? `<tfoot><tr>${opts.foot.map((c) => `<td class="num">${c}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}

function badge(text, tone = '') { return `<span class="badge ${tone}">${esc(text)}</span>`; }

function statCard(label, value, sub = '', icon = '', tone = '') {
  return `<div class="stat ${tone}">${icon ? `<div class="stat-icon">${icon}</div>` : ''}<div><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div></div>`;
}

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
}
const btn = (label, onclick, cls = 'primary') => `<button class="btn ${cls}" onclick="${onclick}">${esc(label)}</button>`;

/* ---------- charts (SVG) ---------- */
const CHART_COLORS = ['#1f7a5a', '#e07b2a', '#3366cc', '#c0392b', '#8e44ad', '#16a085'];
function barChart(labels, series, opts = {}) {
  const W = 560, H = 240, pl = 56, pb = 34, pt = 12, pr = 10;
  const max = Math.max(1, ...series.flatMap((s) => s.values.map(num)));
  const nice = niceMax(max);
  const gw = (W - pl - pr) / labels.length;
  const bw = Math.min(26, (gw - 10) / series.length);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = pt + (H - pt - pb) * (1 - i / 4);
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" class="axis">${shortNum(nice * i / 4)}</text>`;
  }
  labels.forEach((lab, i) => {
    const x0 = pl + gw * i + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = num(s.values[i]);
      const h = (H - pt - pb) * (v / nice);
      g += `<rect x="${x0 + j * bw}" y="${H - pb - h}" width="${bw - 2}" height="${h}" fill="${s.color || CHART_COLORS[j]}" rx="2"><title>${esc(s.name)}: ${nf(v)}</title></rect>`;
    });
    g += `<text x="${pl + gw * i + gw / 2}" y="${H - pb + 16}" text-anchor="middle" class="axis">${esc(lab)}</text>`;
  });
  const legend = series.map((s, j) => `<span><i style="background:${s.color || CHART_COLORS[j]}"></i>${esc(s.name)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg><div class="legend">${legend}</div>`;
}
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 4 ? 4 : m <= 5 ? 5 : 10) * p; }
function shortNum(n) { if (n >= 1e6) return nf(n / 1e6) + 'M'; if (n >= 1e3) return nf(n / 1e3) + 'K'; return nf(n); }

function lastMonths(n = 6) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1];
  return t(en) + ' ' + y.slice(2);
}

/* ---------- print ---------- */
function printHTML(title, body) {
  const size = db.settings.voucherSize;
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) { toast(t('Allow pop-ups to print'), 'err'); return; }
  const b = db.settings.business;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;700&display=swap" rel="stylesheet">
  <style>
   body{font-family:'Noto Sans Myanmar','Myanmar Sangam MN',sans-serif;margin:0;padding:${size === '80mm' ? '4mm' : '10mm'};width:${size === '80mm' ? '72mm' : 'auto'};font-size:${size === '80mm' ? '11px' : '13px'};color:#111}
   h1{font-size:${size === '80mm' ? '15px' : '20px'};margin:0 0 2px;text-align:center} .c{text-align:center} .m{color:#555}
   table{width:100%;border-collapse:collapse;margin:8px 0} th,td{border-bottom:1px solid #ccc;padding:4px;text-align:left} .n{text-align:right}
   .tot td{font-weight:bold;border-top:2px solid #111} .sig{display:flex;justify-content:space-between;margin-top:40px}
   @page{size:${size === '80mm' ? '80mm auto' : 'A5'};margin:0}
  </style></head><body>
  <h1>${esc(b.name || 'SAN Ledger')}</h1><div class="c m">${esc(b.address || '')}${b.phone ? ' · ' + esc(b.phone) : ''}</div>
  ${body}
  <script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  w.document.close();
}

/* ---------- CSV ---------- */
function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function toCSV(cols, rows) {
  const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  return '﻿' + [cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(c.csv ? c.csv(r) : c.v ? c.v(r) : '')).join(','))].join('\n');
}
