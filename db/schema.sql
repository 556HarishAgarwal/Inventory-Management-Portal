PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',   -- admin | viewer
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buildings (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL,
  city    TEXT,
  address TEXT,
  floors  TEXT                                   -- comma separated list e.g. "G,1,2,3"
);

CREATE TABLE IF NOT EXISTS divisions (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS device_types (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'Endpoint'               -- Endpoint | Network | Server | Peripheral | Security
);

CREATE TABLE IF NOT EXISTS employees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_code    TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  designation TEXT,
  division    TEXT,
  building_id INTEGER REFERENCES buildings(id),
  floor       TEXT,
  room        TEXT,
  status      TEXT NOT NULL DEFAULT 'Active',    -- Active | Inactive | Left
  joined_on   TEXT,
  remarks     TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_tag      TEXT UNIQUE NOT NULL,
  device_type    TEXT NOT NULL,
  make           TEXT,
  model          TEXT,
  serial_number  TEXT,
  building_id    INTEGER REFERENCES buildings(id),
  floor          TEXT,
  room           TEXT,
  ip_address     TEXT,
  mac_address    TEXT,
  os_type        TEXT,
  os_version     TEXT,
  obsolete       INTEGER NOT NULL DEFAULT 0,
  edr_installed  INTEGER NOT NULL DEFAULT 0,
  uem_installed  INTEGER NOT NULL DEFAULT 0,
  antivirus      TEXT,
  warranty_expiry TEXT,
  purchase_date  TEXT,
  status         TEXT NOT NULL DEFAULT 'In Use', -- In Use | Spare | Under Repair | Scrapped
  assigned_to    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  remarks        TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dev_building ON devices(building_id);
CREATE INDEX IF NOT EXISTS idx_dev_type ON devices(device_type);

CREATE TABLE IF NOT EXISTS checklists (
  device_id            INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  wifi_disabled        INTEGER DEFAULT 0,
  bluetooth_disabled   INTEGER DEFAULT 0,
  dual_login_created   INTEGER DEFAULT 0,
  usb_disabled         INTEGER DEFAULT 0,
  bios_password_set    INTEGER DEFAULT 0,
  admin_rights_removed INTEGER DEFAULT 0,
  screen_lock_enabled  INTEGER DEFAULT 0,
  patches_updated      INTEGER DEFAULT 0,
  antivirus_updated    INTEGER DEFAULT 0,
  disk_encrypted       INTEGER DEFAULT 0,
  auto_run_disabled    INTEGER DEFAULT 0,
  guest_account_off    INTEGER DEFAULT 0,
  checked_by           TEXT,
  checked_on           TEXT,
  remarks              TEXT
);

CREATE TABLE IF NOT EXISTS diagrams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                     -- HLD | LLD
  title       TEXT NOT NULL,
  version     TEXT,
  filename    TEXT NOT NULL,                     -- stored file name in uploads/diagrams
  orig_name   TEXT,
  size_bytes  INTEGER,
  uploaded_by TEXT,
  uploaded_at TEXT DEFAULT (datetime('now')),
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT DEFAULT (datetime('now')),
  username TEXT,
  action   TEXT,
  entity   TEXT,
  entity_id TEXT,
  details  TEXT
);
