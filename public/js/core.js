/* Shared helpers: DOM, API, toast, modal, table, form */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, attrs = {}, html = '') => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  if (html) n.innerHTML = html;
  return n;
};

const State = { user: null, meta: {}, cache: {} };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/login')) { App.showLogin(); throw new Error('Session expired — please sign in again'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const download = (path) => { window.location.href = '/api' + path; };

function toast(msg, kind = '') {
  const t = el('div', { class: 'toast ' + kind }, esc(msg));
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5200 : 2800);
}
const ok = m => toast(m, 'ok');
const fail = e => toast(e.message || String(e), 'err');
const isAdmin = () => State.user && State.user.role === 'admin';
function guard() { if (!isAdmin()) { toast('Read-only account — ask an admin to make this change', 'err'); return false; } return true; }

/* ---------- modal ---------- */
function modal({ title, body, footer, width, onClose }) {
  const bg = el('div', { class: 'modal-bg' });
  const box = el('div', { class: 'modal' });
  if (width) box.style.width = width;
  const h = el('div', { class: 'modal-h' }, `<h2>${esc(title)}</h2>`);
  const x = el('button', { class: 'x', title: 'Close' }, '&times;');
  h.appendChild(x);
  const b = el('div', { class: 'modal-b' });
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  box.append(h, b);
  if (footer) { const f = el('div', { class: 'modal-f' }); footer.forEach(n => f.appendChild(n)); box.appendChild(f); }
  bg.appendChild(box);
  const close = () => { bg.remove(); document.removeEventListener('keydown', keyer); onClose && onClose(); };
  const keyer = e => { if (e.key === 'Escape') close(); };
  x.onclick = close;
  bg.onclick = e => { if (e.target === bg) close(); };
  document.addEventListener('keydown', keyer);
  $('#modal-root').appendChild(bg);
  return { close, body: b, box };
}
function confirmBox(msg, onYes, yesLabel = 'Delete') {
  const yes = el('button', { class: 'btn danger' }, yesLabel);
  const no = el('button', { class: 'btn' }, 'Cancel');
  const m = modal({ title: 'Please confirm', body: `<p>${esc(msg)}</p>`, footer: [no, yes], width: '440px' });
  no.onclick = m.close;
  yes.onclick = async () => { yes.disabled = true; try { await onYes(); m.close(); } catch (e) { fail(e); yes.disabled = false; } };
}

/* ---------- form builder ---------- */
/* spec: [{name,label,type,options,required,value,span,help,section}] */
function buildForm(spec, values = {}) {
  const form = el('form', { class: 'form-grid' });
  for (const f of spec) {
    if (f.section) { form.appendChild(el('div', { class: 'fieldset-title' }, esc(f.section))); continue; }
    const v = values[f.name] ?? f.value ?? '';
    const wrap = el('div', { class: 'field' });
    if (f.span) wrap.style.gridColumn = `span ${f.span}`;
    if (f.type === 'checkbox') {
      const lab = el('label', { class: 'check' + (v ? ' on' : '') });
      const inp = el('input', { type: 'checkbox', name: f.name });
      inp.checked = !!(v === 1 || v === true || v === '1' || v === 'Y');
      inp.onchange = () => lab.classList.toggle('on', inp.checked);
      lab.append(inp, document.createTextNode(' ' + f.label));
      wrap.appendChild(lab);
    } else {
      wrap.appendChild(el('label', { for: 'f_' + f.name }, esc(f.label) + (f.required ? ' <span class="req">*</span>' : '')));
      let inp;
      if (f.type === 'select') {
        inp = el('select', { name: f.name, id: 'f_' + f.name });
        (f.options || []).forEach(o => {
          const [val, lbl] = Array.isArray(o) ? o : [o, o];
          const opt = el('option', { value: val }, esc(lbl));
          if (String(val) === String(v)) opt.selected = true;
          inp.appendChild(opt);
        });
      } else if (f.type === 'textarea') {
        inp = el('textarea', { name: f.name, id: 'f_' + f.name, rows: f.rows || 2 });
        inp.value = v;
      } else {
        inp = el('input', { name: f.name, id: 'f_' + f.name, type: f.type || 'text', placeholder: f.placeholder || '' });
        inp.value = v;
      }
      if (f.required) inp.required = true;
      wrap.appendChild(inp);
      if (f.help) wrap.appendChild(el('div', { class: 'muted', style: 'font-size:11.5px' }, esc(f.help)));
    }
    form.appendChild(wrap);
  }
  form.onsubmit = e => e.preventDefault();
  return form;
}
function formValues(form) {
  const out = {};
  $$('input,select,textarea', form).forEach(i => {
    if (!i.name) return;
    out[i.name] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value.trim();
  });
  return out;
}

/* ---------- sortable table ---------- */
function table(columns, rows, opts = {}) {
  const wrap = el('div', { class: 'table-wrap' });
  if (!rows.length) { wrap.appendChild(el('div', { class: 'empty' }, opts.empty || 'No records found')); return wrap; }
  const t = el('table');
  const thead = el('thead');
  const tr = el('tr');
  columns.forEach((c, i) => {
    const th = el('th', { class: c.wrap ? 'wrap' : '' }, esc(c.label));
    th.onclick = () => sortBy(i, c);
    tr.appendChild(th);
  });
  thead.appendChild(tr); t.appendChild(thead);
  const tbody = el('tbody'); t.appendChild(tbody);
  let dir = 1, sorted = rows.slice();

  const render = () => {
    tbody.innerHTML = '';
    sorted.forEach(r => {
      const row = el('tr');
      columns.forEach(c => {
        const td = el('td', { class: c.wrap ? 'wrap' : '' });
        const val = c.render ? c.render(r) : (r[c.key] ?? '');
        if (val instanceof Node) td.appendChild(val); else td.innerHTML = c.render ? val : esc(val);
        row.appendChild(td);
      });
      if (opts.onRow) { row.style.cursor = 'pointer'; row.onclick = e => { if (!e.target.closest('button,a')) opts.onRow(r); }; }
      tbody.appendChild(row);
    });
  };
  const sortBy = (i, c) => {
    dir = -dir;
    const key = c.sortKey || c.key;
    sorted.sort((a, b) => {
      const x = a[key], y = b[key];
      const nx = parseFloat(x), ny = parseFloat(y);
      if (!isNaN(nx) && !isNaN(ny) && String(x).trim() !== '' && String(y).trim() !== '') return (nx - ny) * dir;
      return String(x ?? '').localeCompare(String(y ?? '')) * dir;
    });
    render();
  };
  render();
  wrap.appendChild(t);
  if (opts.footer !== false) wrap.appendChild(el('div', { class: 'muted', style: 'padding:8px 12px;font-size:12px;border-top:1px solid var(--line)' }, `${rows.length} record${rows.length === 1 ? '' : 's'}`));
  return wrap;
}
const yn = v => v ? '<span class="badge b-ok">Yes</span>' : '<span class="badge b-bad">No</span>';
const ynSoft = v => v ? '<span class="badge b-ok">Yes</span>' : '<span class="badge b-grey">No</span>';
const statusBadge = s => {
  const map = { 'In Use': 'b-ok', 'Spare': 'b-info', 'Under Repair': 'b-warn', 'Scrapped': 'b-grey', 'Active': 'b-ok', 'Inactive': 'b-grey', 'Left': 'b-grey' };
  return `<span class="badge ${map[s] || 'b-grey'}">${esc(s || '-')}</span>`;
};
const toCsvClient = (cols, rows, name) => {
  const line = a => a.map(v => /[",\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? '')).join(',');
  const csv = '﻿' + [line(cols.map(c => c.label)), ...rows.map(r => line(cols.map(c => c.csv ? c.csv(r) : (r[c.key] ?? ''))))].join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
};
