const Employees = {
  title: 'Employees',
  tab: 'list',
  async render(view, params) {
    if (params.tab) this.tab = params.tab;
    view.innerHTML = '';
    const tabs = el('div', { class: 'tabs' });
    [['list', 'Employee Register'], ['entry', 'Employee Entry'], ['modify', 'Modify / Delete'], ['devices', 'Devices by Employee']]
      .forEach(([k, l]) => {
        const b = el('button', { class: this.tab === k ? 'active' : '' }, l);
        b.onclick = () => { this.tab = k; App.render(); };
        tabs.appendChild(b);
      });
    view.appendChild(tabs);
    const body = el('div');
    view.appendChild(body);
    if (this.tab === 'entry') this.entry(body);
    else if (this.tab === 'devices') this.byEmployee(body);
    else this.list(body, this.tab === 'modify');
  },

  fields(values = {}) {
    const M = State.meta;
    return [
      { section: 'Identity' },
      { name: 'emp_code', label: 'Employee Code', required: true, placeholder: 'EMP1001' },
      { name: 'name', label: 'Full Name', required: true },
      { name: 'email', label: 'Email Address', type: 'email' },
      { name: 'phone', label: 'Phone / Mobile' },
      { name: 'designation', label: 'Designation' },
      { name: 'division', label: 'Division / Department', type: 'select', options: [['', '— select —'], ...M.divisions] },
      { section: 'Location' },
      { name: 'building_id', label: 'Building', type: 'select', options: [['', '— select —'], ...M.buildings.map(b => [b.id, `${b.name} (${b.code})`])] },
      { name: 'floor', label: 'Floor' },
      { name: 'room', label: 'Room / Cabin No.' },
      { section: 'Other' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Left'] },
      { name: 'joined_on', label: 'Joined On', type: 'date' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ];
  },

  entry(body, existing) {
    const form = buildForm(this.fields(), existing || { status: 'Active' });
    const c = card(existing ? 'Edit Employee' : 'New Employee Entry',
      existing ? '' : 'Fields marked * are mandatory');
    c.b.appendChild(form);
    const save = el('button', { class: 'btn primary' }, existing ? 'Save Changes' : 'Save Employee');
    const clear = el('button', { class: 'btn' }, 'Clear');
    c.b.appendChild(el('div', { class: 'row mt' })).append(save, clear);
    clear.onclick = () => { this.tab = 'entry'; App.render(); };
    save.onclick = async () => {
      if (!guard()) return;
      const v = formValues(form);
      if (!v.emp_code || !v.name) return toast('Employee code and name are required', 'err');
      save.disabled = true;
      try {
        if (existing) { await api('/employees/' + existing.id, { method: 'PUT', body: v }); ok('Employee updated'); }
        else { await api('/employees', { method: 'POST', body: v }); ok('Employee saved'); }
        State.cache.meta = null; await App.loadMeta();
        this.tab = 'list'; App.render();
      } catch (e) { fail(e); save.disabled = false; }
    };
    body.appendChild(c.card);
  },

  async list(body, editable) {
    body.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
    const M = State.meta;
    const f = el('div', { class: 'filters' });
    const search = el('input', { placeholder: 'Search name, code, email, division…' });
    const bSel = el('select'); bSel.innerHTML = '<option value="">All buildings</option>' + M.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    const dSel = el('select'); dSel.innerHTML = '<option value="">All divisions</option>' + M.divisions.map(d => `<option>${esc(d)}</option>`).join('');
    const sSel = el('select'); sSel.innerHTML = '<option value="">All statuses</option><option>Active</option><option>Inactive</option><option>Left</option>';
    [['grow', 'Search', search], ['', 'Building', bSel], ['', 'Division', dSel], ['', 'Status', sSel]].forEach(([cls, lab, inp]) => {
      const w = el('div', { class: 'field ' + cls });
      w.append(el('label', {}, lab), inp);
      f.appendChild(w);
    });
    const exp = el('button', { class: 'btn' }, '⬇ Export CSV');
    f.appendChild(exp);
    body.innerHTML = '';
    body.append(f, el('div', { id: 'emp-table' }));

    const cols = [
      { key: 'emp_code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'designation', label: 'Designation' },
      { key: 'division', label: 'Division' },
      { key: 'building_name', label: 'Building' },
      { key: 'floor', label: 'Floor' },
      { key: 'room', label: 'Room' },
      { key: 'device_count', label: 'Devices' },
      { key: 'status', label: 'Status', render: r => statusBadge(r.status), csv: r => r.status },
    ];
    let rows = [];
    const load = async () => {
      const q = new URLSearchParams();
      if (search.value.trim()) q.set('search', search.value.trim());
      if (bSel.value) q.set('building_id', bSel.value);
      if (dSel.value) q.set('division', dSel.value);
      if (sSel.value) q.set('status', sSel.value);
      const r = await api('/employees?' + q);
      rows = r.rows;
      const cs = editable ? [...cols, {
        key: '', label: 'Actions', render: r =>
          `<button class="btn sm" data-edit="${r.id}">Edit</button> <button class="btn sm danger" data-del="${r.id}">Delete</button>`
      }] : cols;
      const t = table(cs, rows, { onRow: r => this.detail(r.id), empty: 'No employees match these filters' });
      t.addEventListener('click', async e => {
        const ed = e.target.dataset.edit, dl = e.target.dataset.del;
        if (ed) { const { employee } = await api('/employees/' + ed); const m = modal({ title: 'Edit Employee', body: el('div') }); this.entry(m.body, employee); }
        if (dl) {
          const emp = rows.find(x => String(x.id) === dl);
          confirmBox(`Delete ${emp.name} (${emp.emp_code})? Devices assigned to them will become unassigned.`, async () => {
            await api('/employees/' + dl, { method: 'DELETE' }); ok('Employee deleted'); load();
          });
        }
      });
      $('#emp-table').replaceChildren(t);
    };
    let timer; search.oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    [bSel, dSel, sSel].forEach(s => s.onchange = load);
    exp.onclick = () => toCsvClient(cols, rows, 'employees.csv');
    load();
  },

  async detail(id) {
    const { employee: e, devices } = await api('/employees/' + id);
    const b = el('div');
    b.innerHTML = `<dl class="kv">
      <dt>Employee Code</dt><dd>${esc(e.emp_code)}</dd>
      <dt>Name</dt><dd>${esc(e.name)}</dd>
      <dt>Email</dt><dd>${esc(e.email || '-')}</dd>
      <dt>Phone</dt><dd>${esc(e.phone || '-')}</dd>
      <dt>Designation</dt><dd>${esc(e.designation || '-')}</dd>
      <dt>Division</dt><dd>${esc(e.division || '-')}</dd>
      <dt>Location</dt><dd>${esc(e.building_name || '-')}, Floor ${esc(e.floor || '-')}, Room ${esc(e.room || '-')}</dd>
      <dt>Status</dt><dd>${statusBadge(e.status)}</dd>
      <dt>Joined On</dt><dd>${esc(e.joined_on || '-')}</dd>
      <dt>Remarks</dt><dd>${esc(e.remarks || '-')}</dd></dl>
      <h3 style="margin:18px 0 8px;font-size:14px">Assigned Devices (${devices.length})</h3>`;
    b.appendChild(table([
      { key: 'asset_tag', label: 'Asset Tag' }, { key: 'device_type', label: 'Type' },
      { key: 'model', label: 'Model' }, { key: 'serial_number', label: 'Serial' },
      { key: 'ip_address', label: 'IP' }, { key: 'os_type', label: 'OS' },
      { key: 'status', label: 'Status', render: r => statusBadge(r.status) },
    ], devices, { footer: false, empty: 'No devices assigned', onRow: d => Devices.detail(d.id) }));
    modal({ title: `${e.name} — ${e.emp_code}`, body: b });
  },

  async byEmployee(body) {
    body.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
    const r = await api('/reports/user_wise');
    body.innerHTML = '';
    const c = card('Devices per Employee', 'Click a row to see the employee record');
    c.b.style.padding = '0';
    c.b.appendChild(table(r.columns, r.rows, { onRow: () => {}, empty: 'No data' }));
    body.appendChild(c.card);
  },
};
