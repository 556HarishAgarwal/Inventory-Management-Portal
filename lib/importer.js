'use strict';
/** Excel / CSV import: preview -> validate -> commit. */
const { all, get, run, audit, db } = require('./db');
const sheet = require('./sheet');

const err = (status, message) => Object.assign(new Error(message), { status });
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const yes = v => (/^(y|yes|true|1|installed|done|enabled)$/i.test(String(v || '').trim()) ? 1 : 0);

/* canonical field -> accepted header aliases */
const SPECS = {
  employees: {
    label: 'Employees',
    key: 'emp_code',
    fields: [
      { f: 'emp_code', label: 'Employee Code', required: true, aliases: ['empcode', 'employeecode', 'empid', 'employeeid', 'code'] },
      { f: 'name', label: 'Name', required: true, aliases: ['employeename', 'fullname', 'username'] },
      { f: 'email', label: 'Email', aliases: ['emailaddress', 'mailid', 'mail'] },
      { f: 'phone', label: 'Phone', aliases: ['mobile', 'contact', 'contactno', 'phoneno'] },
      { f: 'designation', label: 'Designation', aliases: ['title', 'grade'] },
      { f: 'division', label: 'Division', aliases: ['department', 'dept', 'section'] },
      { f: 'building', label: 'Building', aliases: ['buildingname', 'site', 'location', 'office'] },
      { f: 'floor', label: 'Floor', aliases: ['floorno'] },
      { f: 'room', label: 'Room', aliases: ['roomno', 'roomnumber', 'cabin'] },
      { f: 'status', label: 'Status', aliases: ['empstatus'] },
      { f: 'joined_on', label: 'Joined On', aliases: ['doj', 'joiningdate', 'dateofjoining'] },
      { f: 'remarks', label: 'Remarks', aliases: ['remark', 'notes', 'comment'] }
    ]
  },
  devices: {
    label: 'Devices',
    key: 'asset_tag',
    fields: [
      { f: 'asset_tag', label: 'Asset Tag', required: true, aliases: ['assettag', 'assetid', 'assetno', 'tag', 'assetcode', 'systemid'] },
      { f: 'device_type', label: 'Device Type', required: true, aliases: ['devicetype', 'type', 'category', 'assettype'] },
      { f: 'make', label: 'Make', aliases: ['manufacturer', 'brand', 'oem'] },
      { f: 'model', label: 'Model', aliases: ['modelno', 'modelnumber'] },
      { f: 'serial_number', label: 'Serial Number', aliases: ['serialnumber', 'serialno', 'sno', 'serial', 'servicetag'] },
      { f: 'building', label: 'Building', aliases: ['buildingname', 'site', 'location', 'office'] },
      { f: 'floor', label: 'Floor', aliases: ['floorno'] },
      { f: 'room', label: 'Room', aliases: ['roomno', 'roomnumber', 'cabin'] },
      { f: 'ip_address', label: 'IP Address', aliases: ['ipaddress', 'ip'] },
      { f: 'mac_address', label: 'MAC Address', aliases: ['macaddress', 'mac', 'physicaladdress'] },
      { f: 'os_type', label: 'OS Type', aliases: ['ostype', 'os', 'operatingsystem'] },
      { f: 'os_version', label: 'OS Version', aliases: ['osversion', 'osbuild', 'version'] },
      { f: 'obsolete', label: 'Obsolete (Y/N)', bool: true, aliases: ['obsolete', 'obsoleteornot', 'eol', 'endoflife'] },
      { f: 'edr_installed', label: 'EDR Installed (Y/N)', bool: true, aliases: ['edrinstalled', 'edr'] },
      { f: 'uem_installed', label: 'UEM Installed (Y/N)', bool: true, aliases: ['ueminstalled', 'uem', 'mdm'] },
      { f: 'antivirus', label: 'Antivirus', aliases: ['av', 'antivirusname'] },
      { f: 'purchase_date', label: 'Purchase Date', aliases: ['purchasedate', 'podate', 'buydate'] },
      { f: 'warranty_expiry', label: 'Warranty Expiry', aliases: ['warrantyexpiry', 'warranty', 'amcexpiry', 'warrantyenddate'] },
      { f: 'status', label: 'Status', aliases: ['devicestatus', 'assetstatus'] },
      { f: 'assigned_to', label: 'Assigned To (Emp Code or Name)', aliases: ['assignedto', 'user', 'employee', 'empcode', 'custodian', 'assigneduser'] },
      { f: 'remarks', label: 'Remarks', aliases: ['remark', 'notes', 'comment'] },
      { f: 'wifi_disabled', label: 'WiFi Disabled (Y/N)', bool: true, chk: true, aliases: ['wifidisabled', 'wifi'] },
      { f: 'bluetooth_disabled', label: 'Bluetooth Disabled (Y/N)', bool: true, chk: true, aliases: ['bluetoothdisabled', 'bluetooth', 'bt'] },
      { f: 'dual_login_created', label: 'Dual Login (Y/N)', bool: true, chk: true, aliases: ['duallogin', 'duallogincreated', 'secondaryaccount'] },
      { f: 'usb_disabled', label: 'USB Disabled (Y/N)', bool: true, chk: true, aliases: ['usbdisabled', 'usb'] },
      { f: 'bios_password_set', label: 'BIOS Password (Y/N)', bool: true, chk: true, aliases: ['biospassword', 'biospasswordset'] },
      { f: 'disk_encrypted', label: 'Disk Encrypted (Y/N)', bool: true, chk: true, aliases: ['diskencrypted', 'bitlocker', 'encryption'] },
      { f: 'patches_updated', label: 'Patches Updated (Y/N)', bool: true, chk: true, aliases: ['patchesupdated', 'patched', 'patchstatus'] },
      { f: 'antivirus_updated', label: 'Antivirus Updated (Y/N)', bool: true, chk: true, aliases: ['antivirusupdated', 'avupdated'] },
      { f: 'screen_lock_enabled', label: 'Screen Lock (Y/N)', bool: true, chk: true, aliases: ['screenlock', 'screensaverlock'] },
      { f: 'admin_rights_removed', label: 'Admin Rights Removed (Y/N)', bool: true, chk: true, aliases: ['adminrightsremoved', 'localadminremoved'] },
      { f: 'auto_run_disabled', label: 'Autorun Disabled (Y/N)', bool: true, chk: true, aliases: ['autorundisabled', 'autorun'] },
      { f: 'guest_account_off', label: 'Guest Account Disabled (Y/N)', bool: true, chk: true, aliases: ['guestaccountoff', 'guestaccountdisabled', 'guestaccount'] }
    ]
  }
};

function template(entity) {
  const spec = SPECS[entity];
  if (!spec) throw err(404, 'Unknown import type');
  const headers = spec.fields.map(f => f.label);
  const sample = entity === 'employees'
    ? [['EMP1001', 'Ravi Kumar', 'ravi.kumar@example.com', '9876543210', 'Engineer', 'IT', 'Head Office', '3', '304', 'Active', '2021-06-14', '']]
    : [['AST-0001', 'Desktop', 'Dell', 'OptiPlex 7090', 'SNDL0001', 'Head Office', '3', '304', '10.10.3.21', '00:1A:2B:3C:4D:5E',
        'Windows', '11 Pro 23H2', 'N', 'Y', 'Y', 'Trellix', '2023-04-10', '2026-04-09', 'In Use', 'EMP1001', '',
        'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y']];
  return sheet.toCsv([headers, ...sample]);
}

function mapHeaders(spec, headerRow) {
  const map = {};
  const unmapped = [];
  (headerRow || []).forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const hit = spec.fields.find(f => norm(f.f) === n || norm(f.label) === n || f.aliases.includes(n));
    if (hit && !Object.values(map).includes(hit)) map[i] = hit; else if (!hit) unmapped.push(h);
  });
  return { map, unmapped };
}

function parseFile(body) {
  const name = String(body.filename || '').toLowerCase();
  const buf = Buffer.from(String(body.data || '').split(',').pop(), 'base64');
  if (!buf.length) throw err(400, 'Empty file');
  if (name.endsWith('.csv') || name.endsWith('.txt')) return { rows: sheet.readCsv(buf.toString('utf8')), sheetNames: ['CSV'] };
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    const wb = sheet.readXlsx(buf);
    const chosen = body.sheet && wb.sheets[body.sheet] ? body.sheet : wb.names[0];
    return { rows: wb.sheets[chosen], sheetNames: wb.names, sheet: chosen };
  }
  if (name.endsWith('.xls')) throw err(400, 'Old .xls format is not supported - please "Save As" .xlsx or .csv in Excel and retry');
  throw err(400, 'Please upload a .xlsx or .csv file');
}

function resolveBuilding(name, cache) {
  const key = norm(name);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  let b = all('SELECT id,name,code FROM buildings').find(x => norm(x.name) === key || norm(x.code) === key);
  if (!b) {
    const initials = String(name).trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 6) || 'BLD';
    const r = run('INSERT INTO buildings (code,name) VALUES (?,?)', [initials + '-' + Math.floor(Math.random() * 900 + 100), String(name).trim()]);
    b = { id: Number(r.lastInsertRowid) };
  }
  cache.set(key, b.id);
  return b.id;
}

function resolveEmployee(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const e = get('SELECT id FROM employees WHERE emp_code=? COLLATE NOCASE', [s])
    || get('SELECT id FROM employees WHERE name=? COLLATE NOCASE', [s])
    || get('SELECT id FROM employees WHERE email=? COLLATE NOCASE', [s]);
  return e ? e.id : null;
}

function buildRecords(entity, rows) {
  const spec = SPECS[entity];
  if (!rows.length) throw err(400, 'The sheet appears to be empty');
  let headerIdx = 0, best = { map: {}, unmapped: [] }, bestCount = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = mapHeaders(spec, rows[i]);
    const c = Object.keys(r.map).length;
    if (c > bestCount) { bestCount = c; best = r; headerIdx = i; }
  }
  if (bestCount < 2) throw err(400, 'Could not recognise the column headings. Download the template to see the expected columns.');
  const mappedFields = Object.values(best.map);
  const missing = spec.fields.filter(f => f.required && !mappedFields.includes(f));
  if (missing.length) throw err(400, `Required column(s) missing: ${missing.map(f => f.label).join(', ')}`);

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(v => String(v || '').trim() !== '')) continue;
    const rec = { __row: i + 1, __errors: [] };
    for (const [idx, f] of Object.entries(best.map)) {
      const raw = row[idx] === undefined || row[idx] === null ? '' : String(row[idx]).trim();
      rec[f.f] = f.bool ? yes(raw) : raw;
    }
    for (const f of spec.fields) if (f.required && !rec[f.f]) rec.__errors.push(`${f.label} is blank`);
    records.push(rec);
  }
  return { records, mapped: mappedFields.map(f => f.label), unmapped: best.unmapped };
}

function handleImport(ctx) {
  const entity = ctx.body.entity;
  const spec = SPECS[entity];
  if (!spec) throw err(400, 'Choose what you are importing (employees or devices)');
  const parsed = parseFile(ctx.body);
  const { records, mapped, unmapped } = buildRecords(entity, parsed.rows);

  const seen = new Set();
  for (const r of records) {
    const k = String(r[spec.key] || '').toLowerCase();
    if (!k) continue;
    if (seen.has(k)) r.__errors.push(`Duplicate ${spec.key} inside the file`);
    seen.add(k);
    r.__exists = !!get(`SELECT id FROM ${entity} WHERE ${spec.key}=? COLLATE NOCASE`, [r[spec.key]]);
  }
  const valid = records.filter(r => !r.__errors.length);
  const summary = {
    sheetNames: parsed.sheetNames, sheet: parsed.sheet,
    total: records.length, valid: valid.length, invalid: records.length - valid.length,
    toInsert: valid.filter(r => !r.__exists).length,
    toUpdate: valid.filter(r => r.__exists).length,
    mapped, unmapped
  };

  if (ctx.body.mode !== 'commit') return { preview: true, summary, rows: records.slice(0, 200) };

  const mode = ctx.body.onDuplicate || 'update';
  const cache = new Map();
  let inserted = 0, updated = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    for (const r of valid) {
      if (r.__exists && mode === 'skip') { skipped++; continue; }
      const buildingId = r.building ? resolveBuilding(r.building, cache) : null;
      if (entity === 'employees') {
        const cols = ['name', 'email', 'phone', 'designation', 'division', 'floor', 'room', 'status', 'joined_on', 'remarks'];
        const vals = cols.map(c => r[c] || null);
        if (r.__exists) {
          run(`UPDATE employees SET ${cols.map(c => c + '=?').join(',')}, building_id=COALESCE(?,building_id), updated_at=datetime('now') WHERE emp_code=? COLLATE NOCASE`,
            [...vals, buildingId, r.emp_code]);
          updated++;
        } else {
          run(`INSERT INTO employees (emp_code,${cols.join(',')},building_id) VALUES (?,${cols.map(() => '?').join(',')},?)`,
            [r.emp_code, ...vals.map((v, i) => (cols[i] === 'status' ? (v || 'Active') : v)), buildingId]);
          inserted++;
        }
      } else {
        const cols = ['device_type', 'make', 'model', 'serial_number', 'floor', 'room', 'ip_address', 'mac_address',
          'os_type', 'os_version', 'antivirus', 'purchase_date', 'warranty_expiry', 'remarks'];
        const vals = cols.map(c => r[c] || null);
        const flags = [r.obsolete ? 1 : 0, r.edr_installed ? 1 : 0, r.uem_installed ? 1 : 0];
        const assigned = resolveEmployee(r.assigned_to);
        const status = r.status || 'In Use';
        let deviceId;
        if (r.__exists) {
          run(`UPDATE devices SET ${cols.map(c => c + '=?').join(',')},
                 obsolete=?, edr_installed=?, uem_installed=?, status=?,
                 building_id=COALESCE(?,building_id), assigned_to=COALESCE(?,assigned_to), updated_at=datetime('now')
               WHERE asset_tag=? COLLATE NOCASE`, [...vals, ...flags, status, buildingId, assigned, r.asset_tag]);
          deviceId = get('SELECT id FROM devices WHERE asset_tag=? COLLATE NOCASE', [r.asset_tag]).id;
          updated++;
        } else {
          const res = run(`INSERT INTO devices (asset_tag,${cols.join(',')},obsolete,edr_installed,uem_installed,status,building_id,assigned_to)
                           VALUES (?,${cols.map(() => '?').join(',')},?,?,?,?,?,?)`,
            [r.asset_tag, ...vals, ...flags, status, buildingId, assigned]);
          deviceId = Number(res.lastInsertRowid);
          inserted++;
        }
        const chkFields = spec.fields.filter(f => f.chk).map(f => f.f).filter(f => f in r);
        if (chkFields.length) {
          run(`INSERT INTO checklists (device_id,${chkFields.join(',')},checked_by,checked_on)
               VALUES (?,${chkFields.map(() => '?').join(',')},?,date('now'))
               ON CONFLICT(device_id) DO UPDATE SET ${chkFields.map(f => `${f}=excluded.${f}`).join(',')},
                 checked_by=excluded.checked_by, checked_on=excluded.checked_on`,
            [deviceId, ...chkFields.map(f => r[f] || 0), 'Excel import']);
        }
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err(400, 'Import failed and nothing was saved: ' + e.message);
  }
  audit(ctx.user.username, 'import', entity, '', `inserted ${inserted}, updated ${updated}, skipped ${skipped}`);
  return { committed: true, inserted, updated, skipped, invalid: summary.invalid, summary };
}

module.exports = { template, handleImport, SPECS };
