'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { get, run } = require('./db');

const SECRET_FILE = path.join(__dirname, '..', 'data', '.session-secret');
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

function randomPassword() {
  // 16 chars, unambiguous alphabet (no O/0/I/l/1), ~82 bits of entropy
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(16)).map(b => alphabet[b % alphabet.length]).join('');
}

/**
 * Creates the first accounts on an empty database.
 * Passwords are randomly generated unless IMP_ADMIN_PASSWORD / IMP_VIEWER_PASSWORD are set.
 * They are printed once and written to data/FIRST-RUN-CREDENTIALS.txt (git-ignored);
 * delete that file once you have stored the passwords somewhere safe.
 */
function ensureSeedAdmin() {
  if (get('SELECT COUNT(*) c FROM users').c) return;

  const adminPw = process.env.IMP_ADMIN_PASSWORD || randomPassword();
  const viewerPw = process.env.IMP_VIEWER_PASSWORD || randomPassword();
  run('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)',
    ['admin', 'Administrator', hashPassword(adminPw), 'admin']);
  run('INSERT INTO users (username,full_name,password_hash,role) VALUES (?,?,?,?)',
    ['viewer', 'Read Only User', hashPassword(viewerPw), 'viewer']);

  const banner = [
    '',
    '  ================= FIRST RUN: ACCOUNTS CREATED =================',
    `    admin  / ${adminPw}    (full access)`,
    `    viewer / ${viewerPw}    (read only)`,
    '',
    '    Generated once, shown once. Sign in, change them under',
    '    Users & Activity, then delete data/FIRST-RUN-CREDENTIALS.txt.',
    '  ===============================================================',
    '',
  ].join('\n');
  console.log(banner);
  try {
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'FIRST-RUN-CREDENTIALS.txt'),
      `Inventory Management Portal - accounts created ${new Date().toISOString()}\n\n` +
      `admin  / ${adminPw}   (full access)\nviewer / ${viewerPw}   (read only)\n\n` +
      `Change both in the portal (Users & Activity), then delete this file.\n`,
      { mode: 0o600 });
  } catch { /* the console banner above is enough */ }
}

module.exports = { hashPassword, verifyPassword, currentUser, loginCookie, logoutCookie, ensureSeedAdmin };
