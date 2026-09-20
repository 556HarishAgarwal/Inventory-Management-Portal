const Importer = {
  title: 'Import from Excel',
  entity: 'devices',
  file: null,
  preview: null,
  async render(view) {
    view.innerHTML = '';
    const c = card('Import Inventory from Excel / CSV',
      'Your column headings are matched automatically — extra columns are ignored');
    const steps = el('div', { class: 'grid g2' });

    const left = el('div');
    left.innerHTML = '<div class="fieldset-title">1 · What are you importing?</div>';
    const sel = el('select');
    sel.innerHTML = `<option value="devices">Devices (incl. compliance columns)</option><option value="employees">Employees</option>`;
    sel.value = this.entity;
    sel.onchange = () => { this.entity = sel.value; this.preview = null; App.render(); };
    left.appendChild(sel);
    const tpl = el('button', { class: 'btn sm mt' }, '⬇ Download column template');
    tpl.onclick = () => download('/import/template/' + this.entity);
    left.appendChild(el('div', {})).appendChild(tpl);

    left.innerHTML += '<div class="fieldset-title mt">2 · Choose your file</div>';
    const drop = el('div', { class: 'dropzone' }, 'Click to choose your .xlsx or .csv file<br><span class="muted">or drag it here</span>');
    const file = el('input', { type: 'file', accept: '.xlsx,.xlsm,.csv,.txt', class: 'hidden' });
    const pick = f => {
      this.file = f;
      drop.innerHTML = `📊 <b>${esc(f.name)}</b><br><span class="muted">${(f.size / 1024).toFixed(0)} KB — click to change</span>`;
      this.runPreview();
    };
    drop.onclick = () => file.click();
    file.onchange = () => file.files[0] && pick(file.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
    left.append(drop, file);

    const right = el('div');
    right.innerHTML = `<div class="fieldset-title">How matching works</div>
      <ul class="muted" style="padding-left:18px;line-height:1.8;font-size:13px">
        <li>Headings are matched loosely — <code>Asset Tag</code>, <code>asset_tag</code>, <code>Asset No</code> all work.</li>
        <li>The header row is found automatically, even if there are title rows above it.</li>
        <li>Buildings are created on the fly if a name in your sheet does not exist yet.</li>
        <li><code>Assigned To</code> is matched against employee code, name or email.</li>
        <li>Y/N, Yes/No, TRUE/1 all count as "Yes" for flag columns.</li>
        <li>Existing rows are matched on <b>${this.entity === 'devices' ? 'Asset Tag' : 'Employee Code'}</b> — you choose whether they are updated or skipped.</li>
        <li>Nothing is written until you press <b>Import</b> on the preview.</li>
      </ul>`;
    steps.append(left, right);
    c.b.appendChild(steps);
    view.appendChild(c.card);
    view.appendChild(el('div', { id: 'imp-preview', class: 'mt' }));
    if (this.preview) this.showPreview();
  },

  async runPreview() {
    const box = $('#imp-preview');
    box.innerHTML = '<div class="empty"><span class="spin"></span> Reading your file…</div>';
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(this.file); });
      this.fileData = data;
      this.preview = await api('/import', { method: 'POST', body: { entity: this.entity, filename: this.file.name, data, mode: 'preview' } });
      this.showPreview();
    } catch (e) { box.innerHTML = `<div class="card"><div class="card-b" style="color:var(--bad)">${esc(e.message)}</div></div>`; }
  },

  showPreview() {
    const box = $('#imp-preview');
    const s = this.preview.summary;
    box.innerHTML = '';
    const c = card('3 · Preview', `${s.total} data rows read${s.sheet ? ' from sheet "' + s.sheet + '"' : ''}`);
    const tiles = el('div', { class: 'grid g4' });
    [['Rows read', s.total, ''], ['Will be added', s.toInsert, 'good'], ['Will be updated', s.toUpdate, 'warn'], ['Rows with errors', s.invalid, s.invalid ? 'alert' : '']]
      .forEach(([k, v, cls]) => tiles.appendChild(el('div', { class: 'stat ' + cls }, `<div class="v">${v}</div><div class="k">${k}</div>`)));
    c.b.appendChild(tiles);
    c.b.appendChild(el('div', { class: 'mt muted' },
      `<b>Matched columns:</b> ${s.mapped.map(m => `<span class="badge b-info">${esc(m)}</span>`).join(' ')}
       ${s.unmapped.length ? `<br><b>Ignored columns:</b> ${s.unmapped.map(m => `<span class="badge b-grey">${esc(m)}</span>`).join(' ')}` : ''}`));

    const keys = [...new Set(this.preview.rows.flatMap(r => Object.keys(r)))].filter(k => !k.startsWith('__'));
    const cols = [
      { key: '__row', label: 'Row' },
      { key: '__state', label: 'Action', render: r => r.__errors.length ? '<span class="badge b-bad">Error</span>' : r.__exists ? '<span class="badge b-warn">Update</span>' : '<span class="badge b-ok">New</span>' },
      { key: '__errors', label: 'Problem', wrap: true, render: r => esc(r.__errors.join('; ')) },
      ...keys.map(k => ({ key: k, label: k.replace(/_/g, ' ') })),
    ];
    c.b.appendChild(el('div', { class: 'mt' })).appendChild(table(cols, this.preview.rows, { footer: false, empty: 'No rows found' }));
    if (s.total > this.preview.rows.length) c.b.appendChild(el('div', { class: 'muted' }, `Showing first ${this.preview.rows.length} of ${s.total} rows.`));

    const dupSel = el('select');
    dupSel.innerHTML = '<option value="update">Update existing records</option><option value="skip">Skip existing records</option>';
    const go = el('button', { class: 'btn primary' }, `Import ${s.valid} row${s.valid === 1 ? '' : 's'}`);
    go.disabled = !s.valid || !isAdmin();
    const row = el('div', { class: 'row mt' });
    row.append(el('label', { class: 'muted' }, 'On duplicate:'), dupSel, go);
    c.b.appendChild(row);
    go.onclick = async () => {
      go.disabled = true; go.innerHTML = '<span class="spin"></span> Importing…';
      try {
        const r = await api('/import', { method: 'POST', body: { entity: this.entity, filename: this.file.name, data: this.fileData, mode: 'commit', onDuplicate: dupSel.value } });
        ok(`Import complete — ${r.inserted} added, ${r.updated} updated, ${r.skipped} skipped`);
        State.meta = null; await App.loadMeta();
        this.preview = null; App.go('#/dashboard');
      } catch (e) { fail(e); go.disabled = false; go.textContent = 'Retry import'; }
    };
    box.appendChild(c.card);
  },
};
