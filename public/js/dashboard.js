const Dashboard = {
  title: 'Dashboard',
  async render(view) {
    view.innerHTML = '<div class="empty"><span class="spin"></span> Loading inventory summary…</div>';
    const d = await api('/dashboard');
    const t = d.totals;
    view.innerHTML = '';

    /* stat tiles */
    const tiles = [
      ['Total Devices', t.devices, '', () => App.go('#/devices')],
      ['Buildings', t.buildings, '', () => App.go('#/masters')],
      ['Active Employees', t.employees, '', () => App.go('#/employees')],
      ['Unassigned Devices', t.unassigned, 'warn', () => App.go('#/devices?unassigned=1')],
      ['Obsolete Systems', t.obsolete, 'alert', () => App.go('#/devices?obsolete=1')],
      ['Without EDR', t.no_edr, 'alert', () => App.go('#/devices?edr_installed=0')],
      ['Without UEM', t.no_uem, 'warn', () => App.go('#/devices?uem_installed=0')],
      ['Checklist Pending', t.no_checklist, 'warn', () => App.go('#/reports?r=checklist_pending')],
    ];
    const grid = el('div', { class: 'grid g4' });
    tiles.forEach(([k, v, cls, go]) => {
      const s = el('div', { class: `stat click ${cls}` }, `<div class="v">${v}</div><div class="k">${k}</div>`);
      s.onclick = go;
      grid.appendChild(s);
    });
    view.appendChild(grid);

    /* building donut + type donut */
    const row = el('div', { class: 'grid g2 mt' });
    const c1 = card('Devices by Building', 'Hover a slice for the device split of that building');
    c1.b.appendChild(donut(d.byBuilding.map(b => ({
      label: b.name, value: b.total, detail: d.buildingDetail[b.name] || [],
    })), { size: 210, onClick: b => App.go('#/devices?building=' + encodeURIComponent(b.label)) }));
    row.appendChild(c1.card);

    const c2 = card('Devices by Type', 'Click a slice to filter the device register');
    c2.b.appendChild(donut(d.byType.map(x => ({ label: x.name, value: x.total })),
      { size: 210, onClick: x => App.go('#/devices?device_type=' + encodeURIComponent(x.label)) }));
    row.appendChild(c2.card);
    view.appendChild(row);

    const row2 = el('div', { class: 'grid g3 mt' });
    const c3 = card('Operating Systems');
    c3.b.appendChild(bars(d.byOs.map(x => ({ label: x.name, value: x.total })),
      { onClick: x => App.go('#/devices?os_type=' + encodeURIComponent(x.label)) }));
    row2.appendChild(c3.card);

    const c4 = card('Device Status');
    c4.b.appendChild(donut(d.byStatus.map(x => ({ label: x.name, value: x.total })), { size: 170, thickness: 26 }));
    row2.appendChild(c4.card);

    const c5 = card('Compliance Coverage', `${d.compliance.checked} of ${t.devices} devices have a checklist`);
    const gwrap = el('div', { class: 'row', style: 'justify-content:space-around' });
    const pc = (n) => d.compliance.checked ? Math.round(n / d.compliance.checked * 100) : 0;
    [['WiFi off', pc(d.compliance.wifi_disabled)], ['Bluetooth off', pc(d.compliance.bluetooth_disabled)],
     ['Dual login', pc(d.compliance.dual_login_created)], ['USB off', pc(d.compliance.usb_disabled)],
     ['Encrypted', pc(d.compliance.disk_encrypted)]].forEach(([l, p]) => gwrap.appendChild(gauge(p, l)));
    c5.b.appendChild(gwrap);
    row2.appendChild(c5.card);
    view.appendChild(row2);

    /* building matrix */
    const c6 = card('Building × Device Type');
    const types = [...new Set(Object.values(d.buildingDetail).flat().map(x => x.type))].sort();
    const rows = d.byBuilding.map(b => {
      const o = { building: b.name, total: b.total };
      types.forEach(ty => o[ty] = (d.buildingDetail[b.name] || []).find(x => x.type === ty)?.total || 0);
      return o;
    });
    c6.b.style.padding = '0';
    c6.b.appendChild(table(
      [{ key: 'building', label: 'Building' }, ...types.map(ty => ({ key: ty, label: ty })), { key: 'total', label: 'Total' }],
      rows, { footer: false }));
    view.appendChild(el('div', { class: 'mt' })).appendChild(c6.card);

    if (d.recent.length) {
      const c7 = card('Recent Activity');
      c7.b.innerHTML = d.recent.map(r =>
        `<div class="muted" style="padding:3px 0">${esc(r.ts)} — <b>${esc(r.username)}</b> ${esc(r.action)} ${esc(r.entity)} ${esc(r.entity_id || '')}</div>`).join('');
      view.appendChild(el('div', { class: 'mt' })).appendChild(c7.card);
    }
  },
};

function card(title, sub) {
  const c = el('div', { class: 'card' });
  const h = el('div', { class: 'card-h' }, `<h3>${esc(title)}</h3>${sub ? `<span class="muted" style="font-size:12px">${esc(sub)}</span>` : ''}`);
  const b = el('div', { class: 'card-b' });
  c.append(h, b);
  return { card: c, b, h };
}
