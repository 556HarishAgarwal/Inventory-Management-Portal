'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { all, get, run, audit, ROOT } = require('./db');
const auth = require('./auth');
const sheet = require('./sheet');
const reports = require('./reports');
const importer = require('./importer');

const DIAG_DIR = path.join(ROOT, 'uploads', 'diagrams');
fs.mkdirSync(DIAG_DIR, { recursive: true });

const err = (status, message) => Object.assign(new Error(message), { status });
const bool = v => (v === true || v === 1 || /^(y|yes|true|1)$/i.test(String(v ?? '')) ? 1 : 0);
const nn = v => (v === '' || v === undefined ? null : v);

function requireUser(ctx) { if (!ctx.user) throw err(401, 'Please sign in'); return ctx.user; }
function requireAdmin(ctx) {
  requireUser(ctx);
  if (ctx.user.role !== 'admin') throw err(403, 'Read-only account: this action needs an admin login');
  return ctx.user;
}

/* ---------------- generic CRUD helper for master tables ---------------- */
function crud(table, fields, label) {
  return {
    list: () => ({ rows: all(`SELECT * FROM ${table} ORDER BY id`) }),
    create: (ctx) => {
      const vals = fields.map(f => nn(ctx.body[f]));
      const r = run(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, vals);
      audit(ctx.user.username, 'create', label, r.lastInsertRowid, JSON.stringify(ctx.body));
      return { id: Number(r.lastInsertRowid) };
    },
    update: (ctx, id) => {
      run(`UPDATE ${table} SET ${fields.map(f => f + '=?').join(',')} WHERE id=?`,
        [...fields.map(f => nn(ctx.body[f])), id]);
      audit(ctx.user.username, 'update', label, id, JSON.stringify(ctx.body));
      return { ok: true };
    },
    remove: (ctx, id) => {
      run(`DELETE FROM ${table} WHERE id=?`, [id]);
      audit(ctx.user.username, 'delete', label, id, null);
      return { ok: true };
    },
  };
}
const buildings = crud('buildings', ['code', 'name', 'city', 'address', 'floors'], 'building');
const divisions = crud('divisions', ['name'], 'division');
const deviceTypes = crud('device_types', ['name', 'category'], 'device_type');

/* ---------------- employees ---------------- */
const EMP_FIELDS = ['emp_code', 'name', 'email', 'phone', 'designation', 'division',
  'building_id', 'floor', 'room', 'status', 'joined_on', 'remarks'];

function empRow(body) {
  return EMP_FIELDS.map(f => (f === 'building_id' ? (body[f] ? Number(body[f]) : null) : nn(body[f])));
}
function listEmployees(q) {
  const where = [], p = [];
  if (q.search) {
    where.push('(e.name LIKE ? OR e.emp_code LIKE ? OR e.email LIKE ? OR e.division LIKE ?)');
    const s = `%${q.search}%`; p.push(s, s, s, s);
  }
  if (q.building_id) { where.push('e.building_id=?'); p.push(Number(q.building_id)); }
  if (q.division) { where.push('e.division=?'); p.push(q.division); }
  if (q.status) { where.push('e.status=?'); p.push(q.status); }
  const sql = `SELECT e.*, b.name AS building_name,
      (SELECT COUNT(*) FROM devices d WHERE d.assigned_to = e.id) AS device_count
    FROM employees e LEFT JOIN buildings b ON b.id = e.building_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.name`;
  return all(sql, p);
}

/* ---------------- devices ---------------- */
const DEV_FIELDS = ['asset_tag', 'device_type', 'make', 'model', 'serial_number', 'building_id',
  'floor', 'room', 'ip_address', 'mac_address', 'os_type', 'os_version', 'obsolete',
  'edr_installed', 'uem_installed', 'antivirus', 'warranty_expiry', 'purchase_date',
  'status', 'assigned_to', 'remarks'];
const DEV_BOOL = new Set(['obsolete', 'edr_installed', 'uem_installed']);

function devRow(body) {
  return DEV_FIELDS.map(f => {
    if (DEV_BOOL.has(f)) return bool(body[f]);
    if (f === 'building_id' || f === 'assigned_to') return body[f] ? Number(body[f]) : null;
    return nn(body[f]);
  });
}
const DEVICE_SELECT = `SELECT d.*, b.name AS building_name, b.code AS building_code,
    e.name AS assigned_name, e.emp_code AS assigned_code, e.division AS assigned_division,
    e.email AS assigned_email, c.device_id IS NOT NULL AS has_checklist
  FROM devices d
  LEFT JOIN buildings b ON b.id = d.building_id
  LEFT JOIN employees e ON e.id = d.assigned_to
  LEFT JOIN checklists c ON c.device_id = d.id`;

function listDevices(q) {
  const where = [], p = [];
  if (q.search) {
    where.push(`(d.asset_tag LIKE ? OR d.serial_number LIKE ? OR d.ip_address LIKE ? OR d.mac_address LIKE ? OR e.name LIKE ? OR d.model LIKE ?)`);
    const s = `%${q.search}%`; p.push(s, s, s, s, s, s);
  }
  for (const [k, col] of [['building_id', 'd.building_id'], ['device_type', 'd.device_type'],
    ['status', 'd.status'], ['floor', 'd.floor'], ['os_type', 'd.os_type'], ['assigned_to', 'd.assigned_to']]) {
    if (q[k]) { where.push(`${col}=?`); p.push(k === 'building_id' || k === 'assigned_to' ? Number(q[k]) : q[k]); }
  }
  for (const k of ['obsolete', 'edr_installed', 'uem_installed']) {
    if (q[k] !== undefined && q[k] !== '') { where.push(`d.${k}=?`); p.push(bool(q[k])); }
  }
  if (q.unassigned === '1') where.push('d.assigned_to IS NULL');
  return all(`${DEVICE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.asset_tag`, p);
}

/* ---------------- checklist ---------------- */
const CHK_FIELDS = ['wifi_disabled', 'bluetooth_disabled', 'dual_login_created', 'usb_disabled',
  'bios_password_set', 'admin_rights_removed', 'screen_lock_enabled', 'patches_updated',
  'antivirus_updated', 'disk_encrypted', 'auto_run_disabled', 'guest_account_off'];

function saveChecklist(ctx, deviceId) {
  const d = get('SELECT id FROM devices WHERE id=?', [deviceId]);
  if (!d) throw err(404, 'Device not found');
  const vals = CHK_FIELDS.map(f => bool(ctx.body[f]));
  const meta = [nn(ctx.body.checked_by) || ctx.user.full_name || ctx.user.username,
    nn(ctx.body.checked_on) || new Date().toISOString().slice(0, 10), nn(ctx.body.remarks)];
  run(`INSERT INTO checklists (device_id,${CHK_FIELDS.join(',')},checked_by,checked_on,remarks)
       VALUES (${['?', ...CHK_FIELDS.map(() => '?'), '?', '?', '?'].join(',')})
       ON CONFLICT(device_id) DO UPDATE SET ${CHK_FIELDS.map(f => `${f}=excluded.${f}`).join(',')},
         checked_by=excluded.checked_by, checked_on=excluded.checked_on, remarks=excluded.remarks`,
    [deviceId, ...vals, ...meta]);
  audit(ctx.user.username, 'checklist', 'device', deviceId, null);
  return { ok: true };
}

/* ---------------- dashboard ---------------- */
function dashboard() {
  const totals = get(`SELECT
      (SELECT COUNT(*) FROM devices) AS devices,
      (SELECT COUNT(*) FROM employees WHERE status='Active') AS employees,
      (SELECT COUNT(*) FROM buildings) AS buildings,
      (SELECT COUNT(*) FROM devices WHERE obsolete=1) AS obsolete,
      (SELECT COUNT(*) FROM devices WHERE edr_installed=0) AS no_edr,
      (SELECT COUNT(*) FROM devices WHERE uem_installed=0) AS no_uem,
      (SELECT COUNT(*) FROM devices WHERE assigned_to IS NULL) AS unassigned,
      (SELECT COUNT(*) FROM devices d WHERE NOT EXISTS (SELECT 1 FROM checklists c WHERE c.device_id=d.id)) AS no_checklist`);
  const byBuilding = all(`SELECT b.id, b.code, b.name, COUNT(d.id) AS total
      FROM buildings b LEFT JOIN devices d ON d.building_id=b.id GROUP BY b.id ORDER BY total DESC`);
  const byType = all(`SELECT device_type AS name, COUNT(*) AS total FROM devices GROUP BY device_type ORDER BY total DESC`);
  const byStatus = all(`SELECT status AS name, COUNT(*) AS total FROM devices GROUP BY status ORDER BY total DESC`);
  const byOs = all(`SELECT COALESCE(NULLIF(os_type,''),'Unknown') AS name, COUNT(*) AS total FROM devices GROUP BY 1 ORDER BY total DESC`);
  const matrix = all(`SELECT b.name AS building, d.device_type AS type, COUNT(*) AS total
      FROM devices d JOIN buildings b ON b.id=d.building_id GROUP BY 1,2`);
  const buildingDetail = {};
  for (const m of matrix) (buildingDetail[m.building] ||= []).push({ type: m.type, total: m.total });
  const compliance = get(`SELECT
      (SELECT COUNT(*) FROM checklists WHERE wifi_disabled=1) AS wifi_disabled,
      (SELECT COUNT(*) FROM checklists WHERE bluetooth_disabled=1) AS bluetooth_disabled,
      (SELECT COUNT(*) FROM checklists WHERE dual_login_created=1) AS dual_login_created,
      (SELECT COUNT(*) FROM checklists WHERE usb_disabled=1) AS usb_disabled,
      (SELECT COUNT(*) FROM checklists WHERE disk_encrypted=1) AS disk_encrypted,
      (SELECT COUNT(*) FROM checklists) AS checked`);
  const recent = all(`SELECT ts,username,action,entity,entity_id FROM audit_log ORDER BY id DESC LIMIT 8`);
  return { totals, byBuilding, byType, byStatus, byOs, buildingDetail, compliance, recent };
}

/* ---------------- diagrams ---------------- */
function saveDiagram(ctx) {
  const { building_id, kind, title, version, notes, filename, data } = ctx.body;
  if (!data || !filename) throw err(400, 'File is required');
  const buf = Buffer.from(String(data).split(',').pop(), 'base64');
  if (buf.length > 25 * 1024 * 1024) throw err(400, 'File larger than 25 MB');
  const safe = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(filename).slice(0, 10)}`;
  fs.writeFileSync(path.join(DIAG_DIR, safe), buf);
  const r = run(`INSERT INTO diagrams (building_id,kind,title,version,filename,orig_name,size_bytes,uploaded_by,notes)
                 VALUES (?,?,?,?,?,?,?,?,?)`,
    [building_id ? Number(building_id) : null, kind || 'HLD', title || filename, nn(version),
      safe, filename, buf.length, ctx.user.username, nn(notes)]);
  audit(ctx.user.username, 'upload', 'diagram', r.lastInsertRowid, filename);
  return { id: Number(r.lastInsertRowid) };
}
function downloadDiagram(id) {
  const d = get('SELECT * FROM diagrams WHERE id=?', [id]);
  if (!d) throw err(404, 'Diagram not found');
  const p = path.join(DIAG_DIR, d.filename);
  if (!fs.existsSync(p)) throw err(404, 'File missing on disk');
  return { file: fs.readFileSync(p), filename: d.orig_name || d.filename, type: 'application/octet-stream' };
}

/* ---------------- users ---------------- */
function createUser(ctx) {
  const { username, full_name, password, role } = ctx.body;
  if (!username || !password) throw err(400, 'Username and password are required');
  if (String(password).length < 6) throw err(400, 'Password must be at least 6 characters');
  const r = run('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)',
    [username, nn(full_name), auth.hashPassword(password), role === 'admin' ? 'admin' : 'viewer']);
  audit(ctx.user.username, 'create', 'user', r.lastInsertRowid, username);
  return { id: Number(r.lastInsertRowid) };
}

/* ---------------- router ---------------- */
async function handle(ctx) {
  const { method, path: p, body, query } = ctx;
  const seg = p.split('/').filter(Boolean); // ['api', ...]
  const m = (pattern) => {
    const parts = pattern.split('/').filter(Boolean);
    if (parts.length !== seg.length) return null;
    const params = {};
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(seg[i]);
      else if (parts[i] !== seg[i]) return null;
    }
    return params;
  };

  /* --- auth --- */
  if (p === '/api/session') return { user: ctx.user };
  if (p === '/api/login' && method === 'POST') {
    const u = get('SELECT * FROM users WHERE username=? AND active=1', [String(body.username || '').trim()]);
    if (!u || !auth.verifyPassword(String(body.password || ''), u.password_hash)) {
      audit(body.username, 'login-failed', 'user', '', null);
      throw err(401, 'Invalid username or password');
    }
    ctx.headers['Set-Cookie'] = auth.loginCookie(u);
    audit(u.username, 'login', 'user', u.id, null);
    return { user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role } };
  }
  if (p === '/api/logout' && method === 'POST') {
    ctx.headers['Set-Cookie'] = auth.logoutCookie();
    return { ok: true };
  }

  requireUser(ctx);

  /* --- meta / dashboard --- */
  if (p === '/api/meta') return {
    buildings: all('SELECT * FROM buildings ORDER BY name'),
    divisions: all('SELECT name FROM divisions ORDER BY name').map(r => r.name),
    device_types: all('SELECT * FROM device_types ORDER BY category, name'),
    employees: all(`SELECT id, emp_code, name, division FROM employees WHERE status='Active' ORDER BY name`),
    os_types: all(`SELECT DISTINCT os_type AS v FROM devices WHERE os_type IS NOT NULL AND os_type<>'' ORDER BY 1`).map(r => r.v),
    statuses: ['In Use', 'Spare', 'Under Repair', 'Scrapped'],
    report_list: reports.list(),
    checklist_fields: CHK_FIELDS,
  };
  if (p === '/api/dashboard') return dashboard();

  /* --- masters --- */
  for (const [name, c] of [['buildings', buildings], ['divisions', divisions], ['device-types', deviceTypes]]) {
    if (p === `/api/${name}` && method === 'GET') return c.list();
    if (p === `/api/${name}` && method === 'POST') { requireAdmin(ctx); return c.create(ctx); }
    const one = m(`/api/${name}/:id`);
    if (one && method === 'PUT') { requireAdmin(ctx); return c.update(ctx, Number(one.id)); }
    if (one && method === 'DELETE') { requireAdmin(ctx); return c.remove(ctx, Number(one.id)); }
  }

  /* --- employees --- */
  if (p === '/api/employees' && method === 'GET') return { rows: listEmployees(query) };
  if (p === '/api/employees' && method === 'POST') {
    requireAdmin(ctx);
    if (!body.emp_code || !body.name) throw err(400, 'Employee code and name are required');
    if (get('SELECT id FROM employees WHERE emp_code=?', [body.emp_code])) throw err(409, `Employee code ${body.emp_code} already exists`);
    const r = run(`INSERT INTO employees (${EMP_FIELDS.join(',')}) VALUES (${EMP_FIELDS.map(() => '?').join(',')})`, empRow(body));
    audit(ctx.user.username, 'create', 'employee', r.lastInsertRowid, body.emp_code);
    return { id: Number(r.lastInsertRowid) };
  }
  {
    const one = m('/api/employees/:id');
    if (one) {
      const id = Number(one.id);
      if (method === 'GET') {
        const e = get('SELECT e.*, b.name AS building_name FROM employees e LEFT JOIN buildings b ON b.id=e.building_id WHERE e.id=?', [id]);
        if (!e) throw err(404, 'Employee not found');
        return { employee: e, devices: all(`${DEVICE_SELECT} WHERE d.assigned_to=?`, [id]) };
      }
      if (method === 'PUT') {
        requireAdmin(ctx);
        run(`UPDATE employees SET ${EMP_FIELDS.map(f => f + '=?').join(',')}, updated_at=datetime('now') WHERE id=?`, [...empRow(body), id]);
        audit(ctx.user.username, 'update', 'employee', id, body.emp_code);
        return { ok: true };
      }
      if (method === 'DELETE') {
        requireAdmin(ctx);
        run('UPDATE devices SET assigned_to=NULL WHERE assigned_to=?', [id]);
        run('DELETE FROM employees WHERE id=?', [id]);
        audit(ctx.user.username, 'delete', 'employee', id, null);
        return { ok: true };
      }
    }
  }

  /* --- devices --- */
  if (p === '/api/devices' && method === 'GET') return { rows: listDevices(query) };
  if (p === '/api/devices' && method === 'POST') {
    requireAdmin(ctx);
    if (!body.asset_tag || !body.device_type) throw err(400, 'Asset tag and device type are required');
    if (get('SELECT id FROM devices WHERE asset_tag=?', [body.asset_tag])) throw err(409, `Asset tag ${body.asset_tag} already exists`);
    const r = run(`INSERT INTO devices (${DEV_FIELDS.join(',')}) VALUES (${DEV_FIELDS.map(() => '?').join(',')})`, devRow(body));
    audit(ctx.user.username, 'create', 'device', r.lastInsertRowid, body.asset_tag);
    return { id: Number(r.lastInsertRowid) };
  }
  {
    const chk = m('/api/devices/:id/checklist');
    if (chk) {
      const id = Number(chk.id);
      if (method === 'GET') return { checklist: get('SELECT * FROM checklists WHERE device_id=?', [id]) || null };
      if (method === 'PUT' || method === 'POST') { requireAdmin(ctx); return saveChecklist(ctx, id); }
    }
    const asg = m('/api/devices/:id/assign');
    if (asg && method === 'POST') {
      requireAdmin(ctx);
      const id = Number(asg.id);
      const to = body.assigned_to ? Number(body.assigned_to) : null;
      run(`UPDATE devices SET assigned_to=?, updated_at=datetime('now') WHERE id=?`, [to, id]);
      audit(ctx.user.username, to ? 'assign' : 'unassign', 'device', id, to);
      return { ok: true };
    }
    const one = m('/api/devices/:id');
    if (one) {
      const id = Number(one.id);
      if (method === 'GET') {
        const d = get(`${DEVICE_SELECT} WHERE d.id=?`, [id]);
        if (!d) throw err(404, 'Device not found');
        return { device: d, checklist: get('SELECT * FROM checklists WHERE device_id=?', [id]) || null };
      }
      if (method === 'PUT') {
        requireAdmin(ctx);
        run(`UPDATE devices SET ${DEV_FIELDS.map(f => f + '=?').join(',')}, updated_at=datetime('now') WHERE id=?`, [...devRow(body), id]);
        audit(ctx.user.username, 'update', 'device', id, body.asset_tag);
        return { ok: true };
      }
      if (method === 'DELETE') {
        requireAdmin(ctx);
        run('DELETE FROM devices WHERE id=?', [id]);
        audit(ctx.user.username, 'delete', 'device', id, null);
        return { ok: true };
      }
    }
  }

  /* --- reports --- */
  if (p === '/api/reports') return { rows: reports.list() };
  {
    const one = m('/api/reports/:key');
    if (one && method === 'GET') {
      const r = reports.run(one.key, query);
      if (query.format === 'csv') {
        return { file: Buffer.from(sheet.toCsv([r.columns.map(c => c.label), ...r.rows.map(row => r.columns.map(c => row[c.key] ?? ''))]), 'utf8'),
          filename: `${one.key}-${new Date().toISOString().slice(0, 10)}.csv`, type: 'text/csv; charset=utf-8' };
      }
      return r;
    }
  }

  /* --- diagrams --- */
  if (p === '/api/diagrams' && method === 'GET')
    return { rows: all(`SELECT d.*, b.name AS building_name, b.code AS building_code
      FROM diagrams d LEFT JOIN buildings b ON b.id=d.building_id ORDER BY b.name, d.kind, d.title`) };
  if (p === '/api/diagrams' && method === 'POST') { requireAdmin(ctx); return saveDiagram(ctx); }
  {
    const dl = m('/api/diagrams/:id/download');
    if (dl && method === 'GET') return downloadDiagram(Number(dl.id));
    const one = m('/api/diagrams/:id');
    if (one && method === 'DELETE') {
      requireAdmin(ctx);
      const d = get('SELECT * FROM diagrams WHERE id=?', [Number(one.id)]);
      if (d) { try { fs.unlinkSync(path.join(DIAG_DIR, d.filename)); } catch {} run('DELETE FROM diagrams WHERE id=?', [d.id]); }
      audit(ctx.user.username, 'delete', 'diagram', one.id, null);
      return { ok: true };
    }
  }

  /* --- import --- */
  {
    const t = m('/api/import/template/:entity');
    if (t && method === 'GET') {
      const csv = importer.template(t.entity);
      return { file: Buffer.from(csv, 'utf8'), filename: `${t.entity}-import-template.csv`, type: 'text/csv; charset=utf-8' };
    }
  }
  if (p === '/api/import' && method === 'POST') { requireAdmin(ctx); return importer.handleImport(ctx); }

  /* --- users & audit --- */
  if (p === '/api/users' && method === 'GET') { requireAdmin(ctx); return { rows: all('SELECT id,username,full_name,role,active,created_at FROM users ORDER BY id') }; }
  if (p === '/api/users' && method === 'POST') { requireAdmin(ctx); return createUser(ctx); }
  {
    const one = m('/api/users/:id');
    if (one && method === 'PUT') {
      requireAdmin(ctx);
      const id = Number(one.id);
      if (body.password) run('UPDATE users SET password_hash=? WHERE id=?', [auth.hashPassword(body.password), id]);
      if (body.role) run('UPDATE users SET role=? WHERE id=?', [body.role === 'admin' ? 'admin' : 'viewer', id]);
      if (body.active !== undefined) run('UPDATE users SET active=? WHERE id=?', [bool(body.active), id]);
      audit(ctx.user.username, 'update', 'user', id, null);
      return { ok: true };
    }
    if (one && method === 'DELETE') {
      requireAdmin(ctx);
      if (Number(one.id) === ctx.user.id) throw err(400, 'You cannot delete the account you are signed in with');
      run('DELETE FROM users WHERE id=?', [Number(one.id)]);
      return { ok: true };
    }
  }
  if (p === '/api/audit') return { rows: all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300') };

  throw err(404, `Unknown endpoint: ${method} ${p}`);
}

module.exports = { handle };
