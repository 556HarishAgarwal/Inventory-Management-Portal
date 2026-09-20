const Diagrams = {
  title: 'Network Diagrams',
  async render(view) {
    view.innerHTML = '<div class="empty"><span class="spin"></span> Loading…</div>';
    const { rows } = await api('/diagrams');
    const M = State.meta;
    view.innerHTML = '';

    if (isAdmin()) {
      const c = card('Upload Diagram', 'HLD / LLD per building — PDF, Visio, image or any file up to 25 MB');
      const form = buildForm([
        { name: 'building_id', label: 'Building', type: 'select', options: [['', '— not building specific —'], ...M.buildings.map(b => [b.id, b.name])] },
        { name: 'kind', label: 'Diagram Type', type: 'select', options: ['HLD', 'LLD'] },
        { name: 'title', label: 'Title', placeholder: 'Head Office core network HLD' },
        { name: 'version', label: 'Version', placeholder: 'v1.2' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ]);
      c.b.appendChild(form);
      const drop = el('div', { class: 'dropzone mt' }, 'Click to choose a file, or drag it here<br><span class="muted">.pdf .vsdx .png .jpg .svg .drawio .zip …</span>');
      const file = el('input', { type: 'file', class: 'hidden' });
      let picked = null;
      const setFile = f => { picked = f; drop.innerHTML = `📄 <b>${esc(f.name)}</b><br><span class="muted">${(f.size / 1024).toFixed(0)} KB — click to change</span>`; };
      drop.onclick = () => file.click();
      file.onchange = () => file.files[0] && setFile(file.files[0]);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); };
      c.b.append(drop, file);
      const up = el('button', { class: 'btn primary' }, 'Upload');
      c.b.appendChild(el('div', { class: 'row mt' })).append(up);
      up.onclick = async () => {
        if (!picked) return toast('Choose a file first', 'err');
        up.disabled = true;
        try {
          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(picked); });
          await api('/diagrams', { method: 'POST', body: { ...formValues(form), filename: picked.name, data } });
          ok('Diagram uploaded'); App.render();
        } catch (e) { fail(e); up.disabled = false; }
      };
      view.appendChild(c.card);
    }

    const byBuilding = {};
    rows.forEach(r => (byBuilding[r.building_name || 'General / Enterprise'] ||= []).push(r));
    const list = el('div', { class: 'grid g2 mt' });
    if (!rows.length) list.appendChild(el('div', { class: 'empty' }, 'No diagrams uploaded yet'));
    Object.entries(byBuilding).forEach(([b, items]) => {
      const c = card(b, `${items.length} document${items.length === 1 ? '' : 's'}`);
      items.forEach(d => {
        const row = el('div', { class: 'row', style: 'padding:8px 0;border-bottom:1px solid var(--line)' });
        row.innerHTML = `<span class="badge ${d.kind === 'HLD' ? 'b-info' : 'b-warn'}">${esc(d.kind)}</span>
          <span style="flex:1"><b>${esc(d.title)}</b>${d.version ? ' <span class="muted">' + esc(d.version) + '</span>' : ''}
          <br><span class="muted" style="font-size:11.5px">${esc(d.orig_name)} · ${(d.size_bytes / 1024).toFixed(0)} KB · ${esc(d.uploaded_at)}</span></span>`;
        const dl = el('button', { class: 'btn sm' }, '⬇ Download');
        dl.onclick = () => download(`/diagrams/${d.id}/download`);
        row.appendChild(dl);
        if (isAdmin()) {
          const del = el('button', { class: 'btn sm danger' }, 'Delete');
          del.onclick = () => confirmBox(`Delete "${d.title}"?`, async () => { await api('/diagrams/' + d.id, { method: 'DELETE' }); ok('Deleted'); App.render(); });
          row.appendChild(del);
        }
        c.b.appendChild(row);
      });
      list.appendChild(c.card);
    });
    view.appendChild(list);
  },
};
