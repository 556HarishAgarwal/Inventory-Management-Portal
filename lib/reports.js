'use strict';
const { all } = require('./db');

const C = (key, label) => ({ key, label });
const FULL_COLS = [
  C('asset_tag', 'Asset Tag'), C('device_type', 'Device Type'), C('make', 'Make'), C('model', 'Model'),
  C('serial_number', 'Serial No'), C('building_name', 'Building'), C('floor', 'Floor'), C('room', 'Room'),
  C('ip_address', 'IP Address'), C('mac_address', 'MAC Address'), C('os_type', 'OS Type'), C('os_version', 'OS Version'),
  C('obsolete_txt', 'Obsolete'), C('edr_txt', 'EDR'), C('uem_txt', 'UEM'), C('status', 'Status'),
  C('assigned_code', 'Emp Code'), C('assigned_name', 'Assigned To'), C('assigned_division', 'Division'),
  C('warranty_expiry', 'Warranty Expiry'), C('remarks', 'Remarks'),
];
const YN = `CASE WHEN %s=1 THEN 'Yes' ELSE 'No' END`;
const BASE = `SELECT d.*, b.name AS building_name, e.name AS assigned_name, e.emp_code AS assigned_code,
    e.division AS assigned_division, e.email AS assigned_email,
    ${YN.replace('%s', 'd.obsolete')} AS obsolete_txt,
    ${YN.replace('%s', 'd.edr_installed')} AS edr_txt,
    ${YN.replace('%s', 'd.uem_installed')} AS uem_txt
  FROM devices d LEFT JOIN buildings b ON b.id=d.building_id LEFT JOIN employees e ON e.id=d.assigned_to`;

const CHK_BASE = `SELECT d.asset_tag, d.device_type, b.name AS building_name, d.floor, d.room,
    e.name AS assigned_name, c.*,
    ${YN.replace('%s', 'COALESCE(c.wifi_disabled,0)')} AS wifi_txt,
    ${YN.replace('%s', 'COALESCE(c.bluetooth_disabled,0)')} AS bt_txt,
    ${YN.replace('%s', 'COALESCE(c.dual_login_created,0)')} AS dual_txt,
    ${YN.replace('%s', 'COALESCE(c.usb_disabled,0)')} AS usb_txt,
    ${YN.replace('%s', 'COALESCE(c.disk_encrypted,0)')} AS enc_txt,
    ${YN.replace('%s', 'COALESCE(c.bios_password_set,0)')} AS bios_txt,
    ${YN.replace('%s', 'COALESCE(c.patches_updated,0)')} AS patch_txt
  FROM devices d LEFT JOIN buildings b ON b.id=d.building_id
  LEFT JOIN employees e ON e.id=d.assigned_to LEFT JOIN checklists c ON c.device_id=d.id`;
const CHK_COLS = [C('asset_tag', 'Asset Tag'), C('device_type', 'Type'), C('building_name', 'Building'),
  C('floor', 'Floor'), C('room', 'Room'), C('assigned_name', 'Assigned To'), C('wifi_txt', 'WiFi Disabled'),
  C('bt_txt', 'Bluetooth Disabled'), C('dual_txt', 'Dual Login'), C('usb_txt', 'USB Disabled'),
  C('enc_txt', 'Disk Encrypted'), C('bios_txt', 'BIOS Password'), C('patch_txt', 'Patched'),
  C('checked_by', 'Checked By'), C('checked_on', 'Checked On')];

const DEFS = {
  full_inventory: {
    title: 'Full Inventory (all buildings, with assigned user)',
    group: 'Master',
    columns: FULL_COLS,
    sql: `${BASE} ORDER BY b.name, d.device_type, d.asset_tag`,
  },
  obsolete: {
    title: 'Obsolete / End-of-life systems', group: 'Risk',
    columns: FULL_COLS, sql: `${BASE} WHERE d.obsolete=1 ORDER BY b.name, d.asset_tag`,
  },
  no_edr: {
    title: 'Devices without EDR installed', group: 'Security',
    columns: FULL_COLS, sql: `${BASE} WHERE d.edr_installed=0 ORDER BY b.name, d.asset_tag`,
  },
  no_uem: {
    title: 'Devices without UEM installed', group: 'Security',
    columns: FULL_COLS, sql: `${BASE} WHERE d.uem_installed=0 ORDER BY b.name, d.asset_tag`,
  },
  wifi_enabled: {
    title: 'WiFi still enabled (non-compliant)', group: 'Compliance',
    columns: CHK_COLS, sql: `${CHK_BASE} WHERE COALESCE(c.wifi_disabled,0)=0 ORDER BY b.name, d.asset_tag`,
  },
  bluetooth_enabled: {
    title: 'Bluetooth still enabled (non-compliant)', group: 'Compliance',
    columns: CHK_COLS, sql: `${CHK_BASE} WHERE COALESCE(c.bluetooth_disabled,0)=0 ORDER BY b.name, d.asset_tag`,
  },
  no_dual_login: {
    title: 'Dual login not created', group: 'Compliance',
    columns: CHK_COLS, sql: `${CHK_BASE} WHERE COALESCE(c.dual_login_created,0)=0 ORDER BY b.name, d.asset_tag`,
  },
  usb_enabled: {
    title: 'USB ports not disabled', group: 'Compliance',
    columns: CHK_COLS, sql: `${CHK_BASE} WHERE COALESCE(c.usb_disabled,0)=0 ORDER BY b.name, d.asset_tag`,
  },
  not_encrypted: {
    title: 'Disk not encrypted', group: 'Compliance',
    columns: CHK_COLS, sql: `${CHK_BASE} WHERE COALESCE(c.disk_encrypted,0)=0 ORDER BY b.name, d.asset_tag`,
  },
  checklist_pending: {
    title: 'Compliance checklist not yet done', group: 'Compliance',
    columns: CHK_COLS, sql: `${CHK_BASE} WHERE c.device_id IS NULL ORDER BY b.name, d.asset_tag`,
  },
  unassigned: {
    title: 'Devices not assigned to any user', group: 'Allocation',
    columns: FULL_COLS, sql: `${BASE} WHERE d.assigned_to IS NULL ORDER BY b.name, d.asset_tag`,
  },
  user_wise: {
    title: 'User-wise device allocation', group: 'Allocation',
    columns: [C('emp_code', 'Emp Code'), C('name', 'Employee'), C('division', 'Division'),
      C('building_name', 'Building'), C('floor', 'Floor'), C('room', 'Room'),
      C('device_count', 'Devices'), C('device_list', 'Assets')],
    sql: `SELECT e.emp_code, e.name, e.division, b.name AS building_name, e.floor, e.room,
        COUNT(d.id) AS device_count, GROUP_CONCAT(d.asset_tag, ', ') AS device_list
      FROM employees e LEFT JOIN buildings b ON b.id=e.building_id
      LEFT JOIN devices d ON d.assigned_to=e.id
      WHERE e.status='Active' GROUP BY e.id ORDER BY device_count DESC, e.name`,
  },
  building_summary: {
    title: 'Building-wise summary', group: 'Master',
    columns: [C('building_name', 'Building'), C('code', 'Code'), C('total', 'Total Devices'),
      C('desktops', 'Desktops'), C('laptops', 'Laptops'), C('servers', 'Servers'),
      C('switches', 'Network Switches'), C('printers', 'Printers'),
      C('obsolete', 'Obsolete'), C('no_edr', 'No EDR'), C('users', 'Employees')],
    sql: `SELECT b.name AS building_name, b.code,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id) AS total,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.device_type='Desktop') AS desktops,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.device_type='Laptop') AS laptops,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.device_type='Server') AS servers,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.device_type='Network Switch') AS switches,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.device_type='Printer') AS printers,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.obsolete=1) AS obsolete,
        (SELECT COUNT(*) FROM devices d WHERE d.building_id=b.id AND d.edr_installed=0) AS no_edr,
        (SELECT COUNT(*) FROM employees e WHERE e.building_id=b.id AND e.status='Active') AS users
      FROM buildings b ORDER BY total DESC`,
  },
  warranty_expiring: {
    title: 'Warranty expired / expiring in 90 days', group: 'Risk',
    columns: FULL_COLS,
    sql: `${BASE} WHERE d.warranty_expiry IS NOT NULL AND d.warranty_expiry <> ''
        AND date(d.warranty_expiry) <= date('now','+90 day') ORDER BY d.warranty_expiry`,
  },
  ip_register: {
    title: 'IP / MAC address register', group: 'Network',
    columns: [C('ip_address', 'IP Address'), C('mac_address', 'MAC Address'), C('asset_tag', 'Asset Tag'),
      C('device_type', 'Type'), C('building_name', 'Building'), C('floor', 'Floor'), C('room', 'Room'),
      C('assigned_name', 'Assigned To')],
    sql: `${BASE} WHERE d.ip_address IS NOT NULL AND d.ip_address <> '' ORDER BY d.ip_address`,
  },
  duplicate_ip: {
    title: 'Duplicate IP / MAC addresses', group: 'Network',
    columns: [C('value', 'Value'), C('kind', 'Field'), C('count', 'Count'), C('assets', 'Asset Tags')],
    sql: `SELECT ip_address AS value, 'IP' AS kind, COUNT(*) AS count, GROUP_CONCAT(asset_tag,', ') AS assets
        FROM devices WHERE ip_address IS NOT NULL AND ip_address<>'' GROUP BY ip_address HAVING COUNT(*)>1
      UNION ALL
      SELECT mac_address, 'MAC', COUNT(*), GROUP_CONCAT(asset_tag,', ')
        FROM devices WHERE mac_address IS NOT NULL AND mac_address<>'' GROUP BY mac_address HAVING COUNT(*)>1`,
  },
  os_wise: {
    title: 'OS version spread', group: 'Master',
    columns: [C('os_type', 'OS Type'), C('os_version', 'OS Version'), C('total', 'Devices'), C('obsolete', 'Obsolete')],
    sql: `SELECT COALESCE(NULLIF(os_type,''),'Unknown') AS os_type, COALESCE(NULLIF(os_version,''),'-') AS os_version,
        COUNT(*) AS total, SUM(obsolete) AS obsolete FROM devices GROUP BY 1,2 ORDER BY total DESC`,
  },
  employee_master: {
    title: 'Employee master', group: 'Master',
    columns: [C('emp_code', 'Emp Code'), C('name', 'Name'), C('email', 'Email'), C('phone', 'Phone'),
      C('designation', 'Designation'), C('division', 'Division'), C('building_name', 'Building'),
      C('floor', 'Floor'), C('room', 'Room'), C('status', 'Status')],
    sql: `SELECT e.*, b.name AS building_name FROM employees e LEFT JOIN buildings b ON b.id=e.building_id ORDER BY e.name`,
  },
};

const list = () => Object.entries(DEFS).map(([key, d]) => ({ key, title: d.title, group: d.group }));

function runReport(key, query = {}) {
  const def = DEFS[key];
  if (!def) throw Object.assign(new Error(`Unknown report: ${key}`), { status: 404 });
  let rows = all(def.sql);
  if (query.building_id) {
    const b = Number(query.building_id);
    const name = (all('SELECT name FROM buildings WHERE id=?', [b])[0] || {}).name;
    rows = rows.filter(r => r.building_id === b || r.building_name === name);
  }
  return { key, title: def.title, columns: def.columns, rows, generated_at: new Date().toISOString() };
}

module.exports = { list, run: runReport, DEFS };
