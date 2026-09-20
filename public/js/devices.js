const CHECK_LABELS = {
  wifi_disabled: 'WiFi disabled', bluetooth_disabled: 'Bluetooth disabled',
  dual_login_created: 'Dual login created', usb_disabled: 'USB ports disabled',
  bios_password_set: 'BIOS password set', admin_rights_removed: 'Local admin rights removed',
  screen_lock_enabled: 'Screen lock / timeout enabled', patches_updated: 'OS patches up to date',
  antivirus_updated: 'Antivirus / EDR up to date', disk_encrypted: 'Disk encryption enabled',
  auto_run_disabled: 'Autorun disabled', guest_account_off: 'Guest account disabled',
};

const Devices = {
  title: 'Devices',
  tab: 'list',
  filters: {},
  async render(view, params) {
    if (params.tab) this.tab = params.tab;
    if (params.building || params.device_type || params.os_type || params.obsolete !== undefined
      || params.edr_installed !== undefined || params.uem_installed !== undefined || params.unassigned) {
      this.tab = 'list'; this.filters = params;
    }
    view.innerHTML = '';
    const tabs = el('div', { class: 'tabs' });
    [['list', 'Device Register'], ['entry', 'Device Entry'], ['modify', 'Modify / Delete'],
     ['assign', 'Assign to User'], ['checklist', 'Compliance Checklist']].forEach(([k, l]) => {
      const b = el('button', { class: this.tab === k ? 'active' : '' }, l);
      b.onclick = () => { this.tab = k; this.filters = {}; App.render(); };
      tabs.appendChild(b);
    });
    view.appendChild(tabs);
    const body = el('div'); view.appendChild(body);
    if (this.tab === 'entry') this.entry(body);
    else if (this.tab === 'assign') this.assign(body);
    else if (this.tab === 'checklist') this.checklistTab(body);
    else this.list(body, this.tab === 'modify');
  },

  fields() {
    const M = State.meta;
    return [
      { section: 'Identification' },
      { name: 'asset_tag', label: 'Asset Tag / Device ID', required: true, placeholder: 'AST-1001' },
      { name: 'device_type', label: 'Device Type', type: 'select', required: true, options: [['', '— select —'], ...M.device_types.map(t => t.name)] },
      { name: 'make', label: 'Make / Brand' },
      { name: 'model', label: 'Model' },
      { name: 'serial_number', label: 'Serial Number' },
      { section: 'Location' },
      { name: 'building_id', label: 'Building', type: 'select', options: [['', '— select —'], ...M.buildings.map(b => [b.id, `${b.name} (${b.code})`])] },
      { name: 'floor', label: 'Floor' },
      { name: 'room', label: 'Room No.' },
      { section: 'Network' },
      { name: 'ip_address', label: 'IP Address', placeholder: '10.10.3.21' },
      { name: 'mac_address', label: 'MAC Address', placeholder: '00:1A:2B:3C:4D:5E' },
      { section: 'Software & Security' },
      { name: 'os_type', label: 'OS Type', placeholder: 'Windows / Ubuntu / Cisco IOS' },
      { name: 'os_version', label: 'OS Version', placeholder: '11 Pro 23H2' },
      { name: 'antivirus', label: 'Antivirus / EDR Product' },
      { name: 'obsolete', label: 'Obsolete / End of life', type: 'checkbox' },
      { name: 'edr_installed', label: 'EDR installed', type: 'checkbox' },
      { name: 'uem_installed', label: 'UEM installed', type: 'checkbox' },
      { section: 'Lifecycle & Allocation' },
      { name: 'purchase_date', label: 'Purchase Date', type: 'date' },
      { name: 'warranty_expiry', label: 'Warranty / AMC Expiry', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: M.statuses },
      { name: 'assigned_to', label: 'Assigned To', type: 'select', options: [['', '— unassigned —'], ...M.employees.map(e => [e.id, `${e.name} (${e.emp_code})`])] },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ];
  },

  entry(body, existing) {
    const form = buildForm(this.fields(), existing || { status: 'In Use' });
    const c = card(existing ? 'Edit Device' : 'New Device Entry', existing ? '' : 'Fields marked * are mandatory');
    c.b.appendChild(form);
    const save = el('button', { class: 'btn primary' }, existing ? 'Save Changes' : 'Save Device');
    const again = el('button', { class: 'btn' }, 'Save & add another');
    const row = el('div', { class: 'row mt' });
    row.append(save); if (!existing) row.append(again);
    c.b.appendChild(row);
    const submit = async (more) => {
      if (!guard()) return;
      const v = formValues(form);
      if (!v.asset_tag || !v.device_type) return toast('Asset tag and device type are required', 'err');
      save.disabled = again.disabled = true;
      try {
        if (existing) { await api('/devices/' + existing.id, { method: 'PUT', body: v }); ok('Device updated'); App.render(); return; }
        await api('/devices', { method: 'POST', body: v });
        ok('Device saved');
        if (more) { this.tab = 'entry'; App.render(); } else { this.tab = 'list'; App.render(); }
      } catch (e) { fail(e); save.disabled = again.disabled = false; }
    };
    save.onclick = () => submit(false);
    again.onclick = () => submit(true);
    body.appendChild(c.card);
  },
};

Object.assign(Devices, {
  async list(body, editable) {
    const M = State.meta;
    const f = el('div', { class: 'filters' });
    const mk = (label, node, cls = '') => { const w = el('div', { class: 'field ' + cls }); w.append(el('label', {}, label), node); f.appendChild(w); return node; };
    const search = mk('Search', el('input', { placeholder: 'Asset tag, serial, IP, MAC, user, model…' }), 'grow');
    const bSel = mk('Building', el('select')); bSel.innerHTML = '<option value="">All</option>' + M.buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    const tSel = mk('Type', el('select')); tSel.innerHTML = '<option value="">All</option>' + M.device_types.map(t => `<option>${esc(t.name)}</option>`).join('');
    const stSel = mk('Status', el('select')); stSel.innerHTML = '<option value="">All</option>' + M.statuses.map(s => `<option>${esc(s)}</option>`).join('');
    const flSel = mk('Flag', el('select'));
    flSel.innerHTML = `<option value="">All</option><option value="obsolete=1">Obsolete only</option>
      <option value="edr_installed=0">No EDR</option><option value="uem_installed=0">No UEM</option>
      <option value="unassigned=1">Unassigned</option>`;
    const exp = el('button', { class: 'btn' }, '⬇ Export CSV');
    f.appendChild(exp);

    const p = this.filters || {};
    if (p.building) { const b = M.buildings.find(x => x.name === p.building); if (b) bSel.value = b.id; }
    if (p.device_type) tSel.value = p.device_type;
    if (p.obsolete === '1') flSel.value = 'obsolete=1';
    if (p.edr_installed === '0') flSel.value = 'edr_installed=0';
    if (p.uem_installed === '0') flSel.value = 'uem_installed=0';
    if (p.unassigned === '1') flSel.value = 'unassigned=1';
    if (p.os_type) search.value = p.os_type;

    body.innerHTML = '';
    body.append(f, el('div', { id: 'dev-table' }, '<div class="empty"><span class="spin"></span> Loading…</div>'));

    const cols = [
      { key: 'asset_tag', label: 'Asset Tag' },
      { key: 'device_type', label: 'Type' },
      { key: 'model', label: 'Make / Model', render: r => esc([r.make, r.model].filter(Boolean).join(' ')), csv: r => [r.make, r.model].filter(Boolean).join(' ') },
      { key: 'serial_number', label: 'Serial' },
      { key: 'building_name', label: 'Building' },
      { key: 'floor', label: 'Floor' }, { key: 'room', label: 'Room' },
      { key: 'ip_address', label: 'IP' }, { key: 'mac_address', label: 'MAC' },
      { key: 'os_type', label: 'OS' }, { key: 'os_version', label: 'OS Version' },
      { key: 'obsolete', label: 'Obsolete', render: r => r.obsolete ? '<span class="badge b-bad">Yes</span>' : '<span class="badge b-grey">No</span>', csv: r => r.obsolete ? 'Yes' : 'No' },
      { key: 'edr_installed', label: 'EDR', render: r => ynSoft(r.edr_installed), csv: r => r.edr_installed ? 'Yes' : 'No' },
      { key: 'uem_installed', label: 'UEM', render: r => ynSoft(r.uem_installed), csv: r => r.uem_installed ? 'Yes' : 'No' },
      { key: 'assigned_name', label: 'Assigned To', render: r => esc(r.assigned_name || '—'), csv: r => r.assigned_name || '' },
      { key: 'status', label: 'Status', render: r => statusBadge(r.status), csv: r => r.status },
    ];
    let rows = [];
    const load = async () => {
      const q = new URLSearchParams();
      if (search.value.trim()) q.set('search', search.value.trim());
      if (bSel.value) q.set('building_id', bSel.value);
      if (tSel.value) q.set('device_type', tSel.value);
      if (stSel.value) q.set('status', stSel.value);
      if (flSel.value) { const [k, v] = flSel.value.split('='); q.set(k, v); }
      const r = await api('/devices?' + q);
      rows = r.rows;
      const cs = editable ? [...cols, {
        key: '', label: 'Actions', render: r => `<button class="btn sm" data-edit="${r.id}">Edit</button> <button class="btn sm danger" data-del="${r.id}">Delete</button>`
      }] : cols;
      const t = table(cs, rows, { onRow: r => Devices.detail(r.id), empty: 'No devices match these filters' });
      t.addEventListener('click', async e => {
        const ed = e.target.dataset.edit, dl = e.target.dataset.del;
        if (ed) { const { device } = await api('/devices/' + ed); const m = modal({ title: 'Edit Device', body: el('div') }); Devices.entry(m.body, device); }
        if (dl) {
          const d = rows.find(x => String(x.id) === dl);
          confirmBox(`Delete device ${d.asset_tag}? Its checklist will be removed too.`, async () => {
            await api('/devices/' + dl, { method: 'DELETE' }); ok('Device deleted'); load();
          });
        }
      });
      $('#dev-table').replaceChildren(t);
    };
    let timer; search.oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    [bSel, tSel, stSel, flSel].forEach(s => s.onchange = load);
    exp.onclick = () => toCsvClient(cols, rows, 'devices.csv');
    load();
  },
});

Object.assign(Devices, {
  async detail(id) {
    const { device: d, checklist: c } = await api('/devices/' + id);
    const b = el('div');
    const kv = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    b.innerHTML = `<div class="grid g2"><dl class="kv">
        ${kv('Asset Tag', esc(d.asset_tag))}${kv('Device Type', esc(d.device_type))}
        ${kv('Make / Model', esc([d.make, d.model].filter(Boolean).join(' ') || '-'))}
        ${kv('Serial Number', esc(d.serial_number || '-'))}
        ${kv('Location', esc(`${d.building_name || '-'}, Floor ${d.floor || '-'}, Room ${d.room || '-'}`))}
        ${kv('IP / MAC', esc(`${d.ip_address || '-'} / ${d.mac_address || '-'}`))}
        ${kv('OS', esc(`${d.os_type || '-'} ${d.os_version || ''}`))}
      </dl><dl class="kv">
        ${kv('Obsolete', d.obsolete ? '<span class="badge b-bad">Yes</span>' : '<span class="badge b-ok">No</span>')}
        ${kv('EDR Installed', yn(d.edr_installed))}${kv('UEM Installed', yn(d.uem_installed))}
        ${kv('Antivirus', esc(d.antivirus || '-'))}
        ${kv('Purchase / Warranty', esc(`${d.purchase_date || '-'} → ${d.warranty_expiry || '-'}`))}
        ${kv('Status', statusBadge(d.status))}
        ${kv('Assigned To', esc(d.assigned_name ? `${d.assigned_name} (${d.assigned_code})` : 'Unassigned'))}
        ${kv('Remarks', esc(d.remarks || '-'))}
      </dl></div><h3 style="margin:18px 0 8px;font-size:14px">Compliance Checklist</h3>`;
    if (c) {
      const list = el('div', { class: 'grid g3' });
      Object.entries(CHECK_LABELS).forEach(([k, l]) => list.appendChild(el('div', {}, `${c[k] ? '✅' : '❌'} ${esc(l)}`)));
      b.appendChild(list);
      b.appendChild(el('div', { class: 'muted mt' }, `Checked by ${esc(c.checked_by || '-')} on ${esc(c.checked_on || '-')}${c.remarks ? ' — ' + esc(c.remarks) : ''}`));
    } else b.appendChild(el('div', { class: 'muted' }, 'No checklist recorded for this device yet.'));
    const edit = el('button', { class: 'btn' }, 'Edit checklist');
    const m = modal({ title: `${d.asset_tag} — ${d.device_type}`, body: b, footer: [edit] });
    edit.onclick = () => { m.close(); Devices.checklistForm(id, d.asset_tag); };
  },

  async assign(body) {
    body.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
    const { rows: devices } = await api('/devices');
    const M = State.meta;
    body.innerHTML = '';
    const c = card('Assign / Return Device', 'Pick a device, choose the user it belongs to, then save');
    const form = buildForm([
      { name: 'device_id', label: 'Device', type: 'select', required: true, span: 2, options: [['', '— select device —'], ...devices.map(d => [d.id, `${d.asset_tag} · ${d.device_type} · ${d.building_name || '-'} · ${d.assigned_name ? 'with ' + d.assigned_name : 'unassigned'}`])] },
      { name: 'assigned_to', label: 'Assign To', type: 'select', span: 2, options: [['', '— unassign (return to store) —'], ...M.employees.map(e => [e.id, `${e.name} (${e.emp_code})${e.division ? ' · ' + e.division : ''}`])] },
    ]);
    c.b.appendChild(form);
    const save = el('button', { class: 'btn primary' }, 'Save Assignment');
    c.b.appendChild(el('div', { class: 'row mt' })).append(save);
    save.onclick = async () => {
      if (!guard()) return;
      const v = formValues(form);
      if (!v.device_id) return toast('Choose a device', 'err');
      try { await api(`/devices/${v.device_id}/assign`, { method: 'POST', body: { assigned_to: v.assigned_to || null } }); ok('Assignment saved'); App.render(); }
      catch (e) { fail(e); }
    };
    body.appendChild(c.card);

    const un = devices.filter(d => !d.assigned_to);
    const c2 = card(`Unassigned Devices (${un.length})`);
    c2.b.style.padding = '0';
    c2.b.appendChild(table([
      { key: 'asset_tag', label: 'Asset Tag' }, { key: 'device_type', label: 'Type' },
      { key: 'building_name', label: 'Building' }, { key: 'floor', label: 'Floor' },
      { key: 'room', label: 'Room' }, { key: 'status', label: 'Status', render: r => statusBadge(r.status) },
    ], un, { footer: false, empty: 'Every device is assigned' }));
    body.appendChild(el('div', { class: 'mt' })).appendChild(c2.card);
  },

  async checklistTab(body) {
    body.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
    const { rows } = await api('/devices');
    body.innerHTML = '';
    const c = card('Compliance Checklist', 'Open any device to record or update its hardening checklist');
    c.b.style.padding = '0';
    c.b.appendChild(table([
      { key: 'asset_tag', label: 'Asset Tag' }, { key: 'device_type', label: 'Type' },
      { key: 'building_name', label: 'Building' },
      { key: 'assigned_name', label: 'Assigned To', render: r => esc(r.assigned_name || '—') },
      { key: 'has_checklist', label: 'Checklist', render: r => r.has_checklist ? '<span class="badge b-ok">Done</span>' : '<span class="badge b-warn">Pending</span>' },
      { key: '', label: '', render: r => `<button class="btn sm" data-chk="${r.id}">Open</button>` },
    ], rows, { empty: 'No devices' }));
    c.b.addEventListener('click', e => {
      const id = e.target.dataset.chk;
      if (id) { const d = rows.find(x => String(x.id) === id); Devices.checklistForm(id, d.asset_tag); }
    });
    body.appendChild(c.card);
  },

  async checklistForm(id, tag) {
    const { checklist } = await api(`/devices/${id}/checklist`);
    const spec = [
      { section: 'Hardening items' },
      ...Object.entries(CHECK_LABELS).map(([k, l]) => ({ name: k, label: l, type: 'checkbox' })),
      { section: 'Sign-off' },
      { name: 'checked_by', label: 'Checked By' },
      { name: 'checked_on', label: 'Checked On', type: 'date' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2 },
    ];
    const values = checklist || { checked_by: State.user.full_name || State.user.username, checked_on: new Date().toISOString().slice(0, 10) };
    const form = buildForm(spec, values);
    const save = el('button', { class: 'btn primary' }, 'Save Checklist');
    const tickAll = el('button', { class: 'btn' }, 'Tick all');
    const m = modal({ title: `Compliance checklist — ${tag}`, body: form, footer: [tickAll, save] });
    tickAll.onclick = () => $$('input[type=checkbox]', form).forEach(i => { i.checked = true; i.dispatchEvent(new Event('change')); });
    save.onclick = async () => {
      if (!guard()) return;
      try { await api(`/devices/${id}/checklist`, { method: 'PUT', body: formValues(form) }); ok('Checklist saved'); m.close(); App.render(); }
      catch (e) { fail(e); }
    };
  },
});
