'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.IMP_DB || path.join(ROOT, 'data', 'inventory.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
// WAL is faster but unsupported on some network/virtual filesystems.
try { db.exec('PRAGMA journal_mode = WAL;'); }
catch { try { db.exec('PRAGMA journal_mode = DELETE;'); } catch { /* keep engine default */ } }
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));

const all = (sql, params = []) => db.prepare(sql).all(...params);
const get = (sql, params = []) => db.prepare(sql).get(...params);
const run = (sql, params = []) => db.prepare(sql).run(...params);

function audit(username, action, entity, entityId, details) {
  try {
    run('INSERT INTO audit_log (username,action,entity,entity_id,details) VALUES (?,?,?,?,?)',
      [username || 'system', action, entity, String(entityId ?? ''), details ? String(details).slice(0, 500) : null]);
  } catch (_) { /* audit must never break a request */ }
}

module.exports = { db, all, get, run, audit, DB_PATH, ROOT };
