'use strict';
/**
 * Dependency-free tabular readers/writers.
 *  - readXlsx(buffer)  -> { sheets: { name: rows[][] }, first: rows[][] }
 *  - readCsv(text)     -> rows[][]
 *  - toCsv(rows)       -> string (Excel friendly, UTF-8 BOM added by caller)
 * The xlsx reader handles standard, uncompressed-or-deflated .xlsx written by
 * Excel / LibreOffice / Google Sheets. Encrypted or macro-signed files are not supported.
 */
const zlib = require('node:zlib');

/* ---------------- zip ---------------- */
function unzip(buf) {
  const files = {};
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx/zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // local header -> data offset
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    try {
      files[name] = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    } catch { /* skip unreadable entry */ }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return files;
}

/* ---------------- xml helpers ---------------- */
const unescapeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');

function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => unescapeXml(t[1])).join(''));
}

const colIndex = ref => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Excel serial date -> yyyy-mm-dd (1900 system)
function serialToDate(n) {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isNaN(d) ? String(n) : d.toISOString().slice(0, 10);
}

function parseSheet(xml, strings, styleIsDate) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
      const attrs = cm[1] || cm[3] || '';
      const inner = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      const sIdx = (attrs.match(/s="(\d+)"/) || [])[1];
      let val = '';
      if (type === 'inlineStr') {
        val = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => unescapeXml(t[1])).join('');
      } else {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) {
          if (type === 's') val = strings[+v] ?? '';
          else if (type === 'b') val = v === '1' ? 'Y' : 'N';
          else if (styleIsDate && sIdx !== undefined && styleIsDate.has(+sIdx) && v !== '' && !isNaN(+v)) val = serialToDate(+v);
          else val = unescapeXml(v);
        }
      }
      const i = ref ? colIndex(ref) : row.length;
      row[i] = typeof val === 'string' ? val.trim() : val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
    rows.push(row);
  }
  return rows;
}

// styles: which cellXfs indexes use a date number format
function dateStyles(xml) {
  const set = new Set();
  if (!xml) return set;
  const custom = new Map();
  for (const m of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(+m[1], m[2]);
  const isDateFmt = id => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) ||
    (custom.has(id) && /[dmy]/i.test(custom.get(id)) && !/(\[|General)/.test(custom.get(id)));
  const cellXfs = (xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0];
  [...cellXfs.matchAll(/<xf[^>]*numFmtId="(\d+)"[^>]*>|<xf[^>]*numFmtId="(\d+)"[^>]*\/>/g)]
    .forEach((m, i) => { const id = +(m[1] ?? m[2]); if (isDateFmt(id)) set.add(i); });
  return set;
}

function readXlsx(buffer) {
  const files = unzip(buffer);
  const strings = sharedStrings(files['xl/sharedStrings.xml']?.toString('utf8'));
  const styles = dateStyles(files['xl/styles.xml']?.toString('utf8'));
  const wb = files['xl/workbook.xml']?.toString('utf8') || '';
  const rels = files['xl/_rels/workbook.xml.rels']?.toString('utf8') || '';
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) relMap[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheets = {};
  const defs = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g)];
  if (defs.length) {
    for (const [, name, rid] of defs) {
      const target = relMap[rid];
      const buf = files['xl/' + target] || files[target];
      if (buf) sheets[unescapeXml(name)] = parseSheet(buf.toString('utf8'), strings, styles);
    }
  } else {
    Object.keys(files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).forEach((f, i) => {
      sheets['Sheet' + (i + 1)] = parseSheet(files[f].toString('utf8'), strings, styles);
    });
  }
  const names = Object.keys(sheets);
  if (!names.length) throw new Error('No worksheets found in the file');
  return { sheets, names, first: sheets[names[0]] };
}

/* ---------------- csv ---------------- */
function readCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell.trim()); cell = ''; }
    else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
}

const esc = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = rows => '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');

module.exports = { readXlsx, readCsv, toCsv, unzip };
