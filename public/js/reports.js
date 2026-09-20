const Reports = {
  title: 'Reports',
  current: 'full_inventory',
  async render(view, params) {
    if (params.r) this.current = params.r;
    view.innerHTML = '';
    const wrap = el('div', { class: 'grid', style: 'grid-template-columns:280px 1fr;gap:18px;align-items:start' });
    const left = el('div', { class: 'card' });
    left.appendChild(el('div', { class: 'card-h' }, '<h3>Available Reports</h3>'));
    const lb = el('div', { class: 'card-b', style: 'display:flex;flex-direction:column;gap:14px' });
    const groups = {};
    State.meta.report_list.forEach(r => (groups[r.group] ||= []).push(r));
    Object.entries(groups).forEach(([g, list]) => {
      const box = el('div');
      box.appendChild(el('div', { class: 'muted', style: 'font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px' }, esc(g)));
      list.forEach(r => {
        const item = el('div', { class: 'report-item' + (r.key === this.current ? ' active' : '') }, esc(r.title));
        item.onclick = () => { this.current = r.key; App.render(); };
        box.appendChild(el('div', { style: 'margin-bottom:6px' })).appendChild(item);
      });
      lb.appendChild(box);
    });
    left.appendChild(lb);
    const right = el('div', { id: 'rep-body' }, '<div class="empty"><span class="spin"></span> Building report…</div>');
    wrap.append(left, right);
    view.appendChild(wrap);
    this.load();
  },

  async load() {
    const box = $('#rep-body');
    const M = State.meta;
    try {
      const q = new URLSearchParams();
      if (this.building) q.set('building_id', this.building);
      const r = await api(`/reports/${this.current}?` + q);
      box.innerHTML = '';
      const c = card(r.title, `Generated ${new Date(r.generated_at).toLocaleString()}`);
      const tools = el('div', { class: 'row', style: 'margin-left:auto' });
      const bSel = el('select');
      bSel.innerHTML = '<option value="">All buildings</option>' + M.buildings.map(b => `<option value="${b.id}"${String(this.building) === String(b.id) ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
      bSel.onchange = () => { this.building = bSel.value; this.load(); };
      const csv = el('button', { class: 'btn sm' }, '⬇ Excel / CSV');
      csv.onclick = () => download(`/reports/${this.current}?format=csv${this.building ? '&building_id=' + this.building : ''}`);
      const prt = el('button', { class: 'btn sm' }, '🖨 Print');
      prt.onclick = () => window.print();
      tools.append(bSel, csv, prt);
      c.h.appendChild(tools);
      c.b.style.padding = '0';
      c.b.appendChild(table(r.columns, r.rows, { empty: 'Nothing to report — that is usually good news' }));
      box.appendChild(c.card);
    } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  },
};
