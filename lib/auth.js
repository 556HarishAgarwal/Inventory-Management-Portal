'use strict';
const crypto = require('node:crypto');
const { get, run } = require('./db');

const SECRET_FILE = require('node:path').join(__dirname, '..', 'data', '.session-secret');
const fs = require('node:fs');
let SECRET;
try { SECRET = fs.readFileSync(SECRET_FILE, 'utf8'); }
catch { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 }); }

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function verifyPassword(pw, stored) {
  const [alg, salt, h] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const calc = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(h, 'hex'));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function unsign(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

const COOKIE = 'imp_session';
function currentUser(req) {
  const data = unsign(parseCookies(req)[COOKIE]);
  if (!data) return null;
  const u = get('SELECT id,username,full_name,role,active FROM users WHERE id=?', [data.uid]);
  return u && u.active ? u : null;
}
function loginCookie(user) {
  const token = sign({ uid: user.id, exp: Date.now() + 12 * 3600 * 1000 });
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${12 * 3600}`;
}
const logoutCookie = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

function ensureSeedAdmin() {
  const n = get('SELECT COUNT(*) c FROM users').c;
  if (!n) {
    run('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)',
      ['admin', 'Administrator', hashPassword('admin@123'), 'admin']);
    run('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)',
      ['viewer', 'Read Only User', hashPassword('viewer@123'), 'viewer']);
  }
}

module.exports = { hashPassword, verifyPassword, currentUser, loginCookie, logoutCookie, ensureSeedAdmin };
