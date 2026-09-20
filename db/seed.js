'use strict';
/** Sample data so the portal can be demoed before the real Excel is imported.
 *  Run:  npm run seed         (adds sample data, keeps existing rows)
 *        npm run seed -- --reset   (wipes inventory tables first) */
const { all, get, run, db } = require('../lib/db');
const { ensureSeedAdmin } = require('../lib/auth');

const reset = process.argv.includes('--reset');
ensureSeedAdmin();

if (reset) {
  ['checklists', 'diagrams', 'devices', 'employees', 'buildings', 'divisions', 'device_types', 'audit_log']
    .forEach(t => run(`DELETE FROM ${t}`));
  run(`DELETE FROM sqlite_sequence`);
}

const BUILDINGS = [
  ['HO', 'Head Office', 'Mumbai', 'Plot 21, Bandra Kurla Complex', 'G,1,2,3,4'],
  ['RND', 'R&D Centre', 'Pune', 'Hinjewadi Phase 2', 'G,1,2'],
  ['PLT', 'Plant Office', 'Nashik', 'MIDC Ambad', 'G,1'],
  ['DC', 'Data Centre', 'Mumbai', 'BKC Annexe, Basement 1', 'B1,G'],
];
const DIVISIONS = ['IT', 'Finance', 'HR', 'Operations', 'Engineering', 'Quality', 'Security', 'Admin'];
const TYPES = [
  ['Desktop', 'Endpoint'], ['Laptop', 'Endpoint'], ['Thin Client', 'Endpoint'],
  ['Server', 'Server'], ['Network Switch', 'Network'], ['Router', 'Network'],
  ['Firewall', 'Security'], ['Access Point', 'Network'], ['Printer', 'Peripheral'],
  ['Scanner', 'Peripheral'], ['UPS', 'Peripheral'], ['CCTV NVR', 'Security'],
];

BUILDINGS.forEach(b => { if (!get('SELECT id FROM buildings WHERE code=?', [b[0]])) run('INSERT INTO buildings (code,name,city,address,floors) VALUES (?,?,?,?,?)', b); });
DIVISIONS.forEach(d => { if (!get('SELECT id FROM divisions WHERE name=?', [d])) run('INSERT INTO divisions (name) VALUES (?)', [d]); });
TYPES.forEach(t => { if (!get('SELECT id FROM device_types WHERE name=?', [t[0]])) run('INSERT INTO device_types (name,category) VALUES (?,?)', t); });

const bIds = Object.fromEntries(all('SELECT id,code FROM buildings').map(b => [b.code, b.id]));

const NAMES = ['Ravi Kumar', 'Anita Desai', 'Suresh Menon', 'Priya Nair', 'Vikram Shah', 'Neha Gupta',
  'Arjun Rao', 'Kavita Iyer', 'Rahul Verma', 'Sneha Joshi', 'Imran Sheikh', 'Deepa Pillai',
  'Manoj Tiwari', 'Farah Khan', 'Ajay Bose', 'Rekha Sinha', 'Nitin Chawla', 'Pooja Bhatt',
  'Sanjay Patil', 'Meera Krishnan', 'Alok Mishra', 'Divya Reddy', 'Harish Agarwal', 'Tanvi Kulkarni'];
const DESIGS = ['Engineer', 'Senior Engineer', 'Manager', 'Executive', 'Analyst', 'Team Lead', 'Assistant Manager'];
const bCodes = Object.keys(bIds);

let empSeq = get('SELECT COUNT(*) c FROM employees').c;
const empIds = [];
NAMES.forEach((name, i) => {
  const code = 'EMP' + String(1001 + empSeq + i);
  if (get('SELECT id FROM employees WHERE name=?', [name])) return;
  const bc = bCodes[i % bCodes.length];
  const r = run(`INSERT INTO employees (emp_code,name,email,phone,designation,division,building_id,floor,room,status,joined_on)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [code, name, name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      '98' + String(10000000 + i * 137731).slice(0, 8), DESIGS[i % DESIGS.length], DIVISIONS[i % DIVISIONS.length],
      bIds[bc], String((i % 4)) || 'G', String(100 + (i % 4) * 100 + (i % 12)), 'Active',
      `20${18 + (i % 7)}-0${1 + (i % 9)}-1${i % 9}`]);
  empIds.push(Number(r.lastInsertRowid));
});
const allEmp = all('SELECT id FROM employees').map(e => e.id);

const OS = [['Windows', '11 Pro 23H2', 0], ['Windows', '10 Pro 22H2', 0], ['Windows', '7 Pro SP1', 1],
  ['Windows Server', '2022 Standard', 0], ['Windows Server', '2012 R2', 1], ['Ubuntu', '22.04 LTS', 0],
  ['RHEL', '8.8', 0], ['Cisco IOS', '15.2', 0], ['FortiOS', '7.2.5', 0], ['macOS', '14 Sonoma', 0]];
const MAKES = { Desktop: ['Dell OptiPlex 7090', 'HP ProDesk 600 G6', 'Lenovo ThinkCentre M70q'],
  Laptop: ['Dell Latitude 5430', 'HP EliteBook 840 G9', 'Lenovo ThinkPad T14'],
  Server: ['Dell PowerEdge R650', 'HPE ProLiant DL380 Gen10'],
  'Network Switch': ['Cisco C9200-48P', 'Juniper EX4300', 'HPE Aruba 2930F'],
  Router: ['Cisco ISR 4331'], Firewall: ['Fortinet FortiGate 200F', 'Palo Alto PA-820'],
  'Access Point': ['Cisco Meraki MR46', 'Aruba AP-515'], Printer: ['HP LaserJet M428fdw', 'Canon iR2625'],
  'Thin Client': ['HP t640'], Scanner: ['Epson DS-870'], UPS: ['APC Smart-UPS 3000VA'], 'CCTV NVR': ['Hikvision DS-7716NI'] };
const MIX = ['Desktop', 'Desktop', 'Desktop', 'Desktop', 'Laptop', 'Laptop', 'Laptop', 'Network Switch',
  'Network Switch', 'Server', 'Printer', 'Access Point', 'Firewall', 'Router', 'Thin Client', 'UPS', 'CCTV NVR', 'Scanner'];

let n = get('SELECT COUNT(*) c FROM devices').c;
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const TARGET = 96;
for (let i = n; i < TARGET; i++) {
  const type = MIX[i % MIX.length];
  const bc = bCodes[i % bCodes.length];
  const bid = bIds[bc];
  const os = type === 'Server' ? rand(OS.slice(3, 7))
    : ['Network Switch', 'Router', 'Access Point'].includes(type) ? OS[7]
    : type === 'Firewall' ? OS[8] : rand(OS.slice(0, 3));
  const tag = 'AST-' + String(1001 + i);
  if (get('SELECT id FROM devices WHERE asset_tag=?', [tag])) continue;
  const floor = ['G', '1', '2', '3'][i % 4];
  const room = String(100 + (i % 4) * 100 + (i % 25));
  const mac = 'AC:' + [1, 2, 3, 4].map(k => (((i * 7 + k * 31) % 255) + 1).toString(16).padStart(2, '0').toUpperCase()).join(':');
  const assign = ['Network Switch', 'Router', 'Firewall', 'Server', 'Access Point', 'UPS', 'CCTV NVR'].includes(type)
    ? null : rand(allEmp);
  const obsolete = os[2] || (i % 11 === 0 ? 1 : 0);
  const edr = ['Network Switch', 'Router', 'Access Point', 'UPS'].includes(type) ? 0 : (i % 7 === 0 ? 0 : 1);
  const uem = ['Desktop', 'Laptop', 'Thin Client'].includes(type) ? (i % 5 === 0 ? 0 : 1) : 0;
  const res = run(`INSERT INTO devices (asset_tag,device_type,make,model,serial_number,building_id,floor,room,
      ip_address,mac_address,os_type,os_version,obsolete,edr_installed,uem_installed,antivirus,
      purchase_date,warranty_expiry,status,assigned_to,remarks)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [tag, ...(() => { const m = rand(MAKES[type] || ['Generic Device']).split(' '); return [type, m[0], m.slice(1).join(' ') || m[0]]; })(),
      'SN' + String(90000 + i * 13), bid, floor, room,
      `10.${10 + (bCodes.indexOf(bc))}.${floor === 'G' ? 0 : floor}.${20 + (i % 200)}`, mac,
      os[0], os[1], obsolete, edr, uem, edr ? rand(['Trellix', 'CrowdStrike', 'Microsoft Defender']) : null,
      `20${19 + (i % 6)}-0${1 + (i % 9)}-05`, `20${25 + (i % 3)}-0${1 + (i % 9)}-04`,
      i % 17 === 0 ? 'Spare' : i % 23 === 0 ? 'Under Repair' : 'In Use', assign, null]);
  const id = Number(res.lastInsertRowid);
  // checklist for ~75% of endpoints
  if (['Desktop', 'Laptop', 'Thin Client', 'Server'].includes(type) && i % 4 !== 0) {
    const p = (odds) => (Math.random() < odds ? 1 : 0);
    run(`INSERT INTO checklists (device_id,wifi_disabled,bluetooth_disabled,dual_login_created,usb_disabled,
        bios_password_set,admin_rights_removed,screen_lock_enabled,patches_updated,antivirus_updated,
        disk_encrypted,auto_run_disabled,guest_account_off,checked_by,checked_on)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,date('now',?))`,
      [id, p(.8), p(.85), p(.7), p(.75), p(.6), p(.65), p(.95), p(.8), p(.9), p(.55), p(.85), p(.9),
        'IT Security Team', `-${i % 120} day`]);
  }
}

console.log('Seed complete:');
console.log('  buildings :', get('SELECT COUNT(*) c FROM buildings').c);
console.log('  employees :', get('SELECT COUNT(*) c FROM employees').c);
console.log('  devices   :', get('SELECT COUNT(*) c FROM devices').c);
console.log('  checklists:', get('SELECT COUNT(*) c FROM checklists').c);
console.log("  users     : see the banner printed on first 'npm start' (or data/FIRST-RUN-CREDENTIALS.txt)");
