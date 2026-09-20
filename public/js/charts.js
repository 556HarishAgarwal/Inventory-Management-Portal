/* Dependency-free SVG charts: donut with hover tooltip + horizontal bars */
const PALETTE = ['#1f5fd6', '#12856b', '#b7791f', '#8e44ad', '#c0392b', '#0b7285', '#d6336c', '#5f6b7a',
  '#2b8a3e', '#e8590c', '#4263eb', '#087f5b'];

let tipEl = null;
function showTip(html, ev) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.style.left = Math.min(ev.clientX + 14, innerWidth - 260) + 'px';
  tipEl.style.top = Math.max(ev.clientY - 12, 8) + 'px';
  tipEl.style.display = 'block';
}
const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };

/**
 * donut(data, opts)
 * data: [{label, value, detail?:[{type,total}]}]
 */
function donut(data, opts = {}) {
  const size = opts.size || 200, thickness = opts.thickness || 30;
  const r = size / 2 - 4, cx = size / 2, cy = size / 2, inner = r - thickness;
  const total = data.reduce((s, d) => s + Number(d.value || 0), 0);
  const box = document.createElement('div');
  box.className = 'chart-flex';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size); svg.setAttribute('height', size);

  if (!total) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', (r + inner) / 2);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#eef1f6'); c.setAttribute('stroke-width', thickness);
    svg.appendChild(c);
  }
  let a0 = -Math.PI / 2;
  data.forEach((d, i) => {
    const frac = total ? Number(d.value) / total : 0;
    if (!frac) return;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = document.createElementNS(ns, 'path');
    const P = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
    // full-circle single slice needs a split path
    const d1 = frac > 0.999
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} M ${cx - inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} Z`
      : `M ${P(r, a0)} A ${r} ${r} 0 ${large} 1 ${P(r, a1)} L ${P(inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${P(inner, a0)} Z`;
    p.setAttribute('d', d1);
    p.setAttribute('fill', d.color || PALETTE[i % PALETTE.length]);
    p.setAttribute('class', 'donut-seg');
    if (frac > 0.999) p.setAttribute('fill-rule', 'evenodd');
    const pct = ((frac * 100) || 0).toFixed(1);
    const detail = (d.detail || []).map(x => `${esc(x.type)}: <b style="display:inline">${x.total}</b>`).join('<br>');
    p.addEventListener('mousemove', e => showTip(
      `<b>${esc(d.label)}</b>${d.value} ${opts.unit || 'devices'} · ${pct}%${detail ? '<hr style="border:0;border-top:1px solid #3a4a63;margin:5px 0">' + detail : ''}`, e));
    p.addEventListener('mouseleave', hideTip);
    if (opts.onClick) p.addEventListener('click', () => opts.onClick(d));
    svg.appendChild(p);
    a0 = a1;
  });
  const t1 = document.createElementNS(ns, 'text');
  t1.setAttribute('x', cx); t1.setAttribute('y', cy - 2);
  t1.setAttribute('text-anchor', 'middle'); t1.setAttribute('font-size', '26'); t1.setAttribute('font-weight', '700');
  t1.setAttribute('fill', '#16202e'); t1.textContent = total;
  const t2 = document.createElementNS(ns, 'text');
  t2.setAttribute('x', cx); t2.setAttribute('y', cy + 17);
  t2.setAttribute('text-anchor', 'middle'); t2.setAttribute('font-size', '11.5'); t2.setAttribute('fill', '#6a7891');
  t2.textContent = opts.centerLabel || 'total';
  svg.append(t1, t2);
  box.appendChild(svg);

  const leg = document.createElement('div');
  leg.className = 'chart-legend';
  data.forEach((d, i) => {
    const li = document.createElement('div');
    li.className = 'li';
    li.innerHTML = `<span class="dot" style="background:${d.color || PALETTE[i % PALETTE.length]}"></span>
      <span style="flex:1">${esc(d.label)}</span><b>${d.value}</b>`;
    li.addEventListener('mousemove', e => showTip(`<b>${esc(d.label)}</b>${d.value} ${opts.unit || 'devices'}`, e));
    li.addEventListener('mouseleave', hideTip);
    if (opts.onClick) { li.style.cursor = 'pointer'; li.onclick = () => opts.onClick(d); }
    leg.appendChild(li);
  });
  box.appendChild(leg);
  return box;
}

function bars(data, opts = {}) {
  const max = Math.max(1, ...data.map(d => Number(d.value || 0)));
  const box = document.createElement('div');
  data.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<div title="${esc(d.label)}" style="overflow:hidden;text-overflow:ellipsis">${esc(d.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.value / max * 100).toFixed(1)}%;background:${d.color || PALETTE[i % PALETTE.length]}"></div></div>
      <div class="right"><b>${d.value}</b></div>`;
    if (opts.onClick) { row.style.cursor = 'pointer'; row.onclick = () => opts.onClick(d); }
    box.appendChild(row);
  });
  if (!data.length) box.innerHTML = '<div class="empty">No data</div>';
  return box;
}

function gauge(pct, label) {
  const box = document.createElement('div');
  box.style.textAlign = 'center';
  const color = pct >= 85 ? '#12856b' : pct >= 60 ? '#b7791f' : '#c0392b';
  box.innerHTML = `<svg viewBox="0 0 120 70" width="130" height="76">
      <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#eef1f6" stroke-width="12" stroke-linecap="round"/>
      <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(pct / 100 * 157).toFixed(1)} 157"/>
      <text x="60" y="58" text-anchor="middle" font-size="20" font-weight="700" fill="${color}">${pct}%</text>
    </svg><div class="muted" style="font-size:12px">${esc(label)}</div>`;
  return box;
}
