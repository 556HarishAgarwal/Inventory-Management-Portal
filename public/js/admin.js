/* Masters (buildings / divisions / device types), Users, Audit log */
const Masters = {
  title: 'Master Data',
  tab: 'buildings',
  async render(view, params) {
    if (params.tab) this.tab = params.tab;
    view.innerHTML = '';
    const tabs = el('div', { class: 'tabs' });
    [['buildings', 'Buildings'], ['divisions', 'Divisions'], ['device-types', 'Device Types']].forEach(([k, l]) => {
      const b = el('button', { class: this.tab === k ? 'active' : '' }, l);
      b.onclick = () => { this.tab = k; App.render(); };
      tabs.appendChild(b);
    });
    view.appendChild(tabs);
    const body = el('div'); view.appendChild(body);
    const specs = {
      buildings: {
        label: 'Building',
        cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'city', label: 'City' },
          { key: 'address', label: 'Address', wrap: true }, { key: 'floors', label: 'Floors' }],
        form: [{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
          { name: 'city', label: 'City' }, { name: 'address', label: 'Address' },
          { name: 'floors', label: 'Floors (comma separated)', placeholder: 'G,1,2,3' }],
      },
      divisions: { label: 'Division', cols: [{ key: 'name', label: 'Name' }], form: [{ name: 'name', label: 'Name', required: true }] },
      'device-types': {
        label: 'Device Type',
        cols: [{ key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }],
        form: [{ name: 'name', label: 'Name', required: true },
          { name: 'category', label: 'Category', type: 'select', options: ['Endpoint', 'Server', 'Network', 'Security', 'Peripheral'] }],
      },
    };
    const spec = specs[this.tab];
    const { rows } = await api('/' + this.tab);
    const c = card(spec.label + 's');
    const add = el('button', { class: 'btn primary sm', style: 'margin-left:auto' }, '+ Add ' + spec.label);
    c.h.appendChild(add);
    c.b.style.padding = '0';
    const cols = [...spec.cols, { key: '', label: 'Actions', render: r => `<button class="btn sm" data-edit="${r.id}">Edit</button> <button class="btn sm danger" data-del="${r.id}">Delete</button>` }];
    c.b.appendChild(table(cols, rows, { empty: 'Nothing here yet' }));
    const openForm = (existing) => {
      const form = buildForm(spec.form, existing || {});
      const save = el('button', { class: 'btn primary' }, 'Save');
      const m = modal({ title: (existing ? 'Edit ' : 'New ') + spec.label, body: form, footer: [save], width: '520px' });
      save.onclick = async () => {
        if (!guard()) return;
        try {
          const v = formValues(form);
          if (existing) await api(`/${this.tab}/${existing.id}`, { method: 'PUT', body: v });
          else await api('/' + this.tab, { method: 'POST', body: v });
          ok('Saved'); m.close(); State.meta = null; await App.loadMeta(); App.render();
        } catch (e) { fail(e); }
      };
    };
    add.onclick = () => openForm(null);
    c.b.addEventListener('click', e => {
      const ed = e.target.dataset.edit, dl = e.target.dataset.del;
      if (ed) openForm(rows.find(r => String(r.id) === ed));
      if (dl) confirmBox('Delete this record? Rows that reference it keep their data but lose the link.', async () => {
        await api(`/${this.tab}/${dl}`, { method: 'DELETE' }); ok('Deleted'); State.meta = null; await App.loadMeta(); App.render();
      });
    });
    body.appendChild(c.card);
  },
};

const Admin = {
  title: 'Users & Activity',
  async render(view) {
    view.innerHTML = '';
    if (!isAdmin()) { view.innerHTML = '<div class="empty">Admin access required</div>'; return; }
    const { rows: users } = await api('/users');
    const c = card('Portal Users');
    const add = el('button', { class: 'btn primary sm', style: 'margin-left:auto' }, '+ Add User');
    c.h.appendChild(add);
    c.b.style.padding = '0';
    c.b.appendChild(table([
      { key: 'username', label: 'Username' }, { key: 'full_name', label: 'Name' },
      { key: 'role', label: 'Role', render: r => `<span class="badge ${r.role === 'admin' ? 'b-info' : 'b-grey'}">${esc(r.role)}</span>` },
      { key: 'active', label: 'Active', render: r => ynSoft(r.active) },
      { key: 'created_at', label: 'Created' },
      { key: '', label: 'Actions', render: r => `<button class="btn sm" data-pw="${r.id}">Reset password</button> <button class="btn sm danger" data-del="${r.id}">Delete</button>` },
    ], users, { empty: 'No users' }));
    add.onclick = () => {
      const form = buildForm([
        { name: 'username', label: 'Username', required: true },
        { name: 'full_name', label: 'Full Name' },
        { name: 'password', label: 'Password', type: 'password', required: true, help: 'Minimum 6 characters' },
        { name: 'role', label: 'Role', type: 'select', options: [['viewer', 'Viewer (read only)'], ['admin', 'Admin (full access)']] },
      ]);
      const save = el('button', { class: 'btn primary' }, 'Create user');
      const m = modal({ title: 'New user', body: form, footer: [save], width: '520px' });
      save.onclick = async () => { try { await api('/users', { method: 'POST', body: formValues(form) }); ok('User created'); m.close(); App.render(); } catch (e) { fail(e); } };
    };
    c.b.addEventListener('click', e => {
      const pw = e.target.dataset.pw, dl = e.target.dataset.del;
      if (pw) {
        const form = buildForm([{ name: 'password', label: 'New password', type: 'password', required: true }]);
        const save = el('button', { class: 'btn primary' }, 'Set password');
        const m = modal({ title: 'Reset password', body: form, footer: [save], width: '440px' });
        save.onclick = async () => { try { await api('/users/' + pw, { method: 'PUT', body: formValues(form) }); ok('Password updated'); m.close(); } catch (er) { fail(er); } };
      }
      if (dl) confirmBox('Delete this user?', async () => { await api('/users/' + dl, { method: 'DELETE' }); ok('User deleted'); App.render(); });
    });
    view.appendChild(c.card);

    const { rows: log } = await api('/audit');
    const c2 = card('Activity Log', 'Last 300 actions');
    c2.b.style.padding = '0';
    c2.b.appendChild(table([
      { key: 'ts', label: 'When' }, { key: 'username', label: 'User' }, { key: 'action', label: 'Action' },
      { key: 'entity', label: 'Entity' }, { key: 'entity_id', label: 'ID' }, { key: 'details', label: 'Details', wrap: true },
    ], log, { empty: 'No activity yet' }));
    view.appendChild(el('div', { class: 'mt' })).appendChild(c2.card);
  },
};
