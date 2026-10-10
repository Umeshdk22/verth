// Verth's charts: a score gauge, a smooth area/line chart and a stacked bar chart, drawn as SVG
// with no library, so they load instantly. Axis labels, dots and the tooltip are HTML on top of the
// SVG, so text stays sharp and readable on a phone and on a laptop.
// One listener (bindCharts) serves every chart, because screens are re-drawn often.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TONE = { good: '#12A66B', ok: '#12A66B', violet: '#6B3DF0', mid: '#E8A33D', wait: '#E8A33D', bad: '#DC3545' };

// The last n days in India time: [{ key: '2026-10-10', label: '10 Oct' }, …], oldest first.
export function lastDays(n = 14, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - 1 - i) * 864e5;
    return { key: new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), label: new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) };
  });
}

// A 270° gauge, like a speedometer: value out of max.
export function gauge(value, max = 100, { label = '', tone = 'good', sub = '' } = {}) {
  const v = Math.max(0, Math.min(max, Number(value) || 0)), R = 78, C = 2 * Math.PI * R, sweep = 0.75 * C, fill = sweep * (v / max);
  const color = TONE[tone] || TONE.good;
  return `<div class="gauge" role="img" aria-label="${esc(label)}: ${Math.round(v)} out of ${max}">
    <svg viewBox="0 0 200 172" aria-hidden="true">
      <circle cx="100" cy="100" r="${R}" fill="none" stroke="#E8ECF4" stroke-width="16" stroke-linecap="round" stroke-dasharray="${sweep.toFixed(1)} ${C.toFixed(1)}" transform="rotate(135 100 100)"/>
      <circle cx="100" cy="100" r="${R}" fill="none" class="gauge-val" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${fill.toFixed(1)} ${C.toFixed(1)}" style="--fill:${fill.toFixed(1)}" transform="rotate(135 100 100)"/>
    </svg>
    <div class="gauge-in"><b>${Math.round(v)}${max !== 100 ? `<small>/${max}</small>` : ''}</b>${label ? `<span>${esc(label)}</span>` : ''}</div>
    ${sub ? `<p class="gauge-sub">${esc(sub)}</p>` : ''}
  </div>`;
}

// Catmull-Rom → Bézier: a smooth curve through every point, never overshooting below zero.
function smooth(pts, floor) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1y = Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6), c2y = Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${c1y.toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
const niceTop = (max) => { const m = Math.max(4, max); const step = Math.ceil(m / 4); return step * 4; };
// Which dates get a label: about 7, always the last one, never two crowded together.
export function labelIndexes(n, max = 7) {
  const step = Math.max(1, Math.ceil(n / max)), shown = [];
  for (let i = 0; i < n; i += step) shown.push(i);
  if (shown[shown.length - 1] !== n - 1) { if (n - 1 - shown[shown.length - 1] < step * 0.75) shown.pop(); shown.push(n - 1); }
  return new Set(shown);
}
function frame({ labels, top, svg, hits, title, legend, height, dots = '' }) {
  const n = labels.length, show = labelIndexes(n, 5);
  const px = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  return `<figure class="chart" style="--h:${height}px">
    <div class="vc-y" aria-hidden="true">${[4, 3, 2, 1, 0].map((k) => `<span style="top:${100 - k * 25}%">${(top / 4) * k}</span>`).join('')}</div>
    <div class="vc-plot">${svg}<i class="vc-cursor" hidden></i>${dots}<div class="vc-hits">${hits}</div><div class="vc-tip" role="status" aria-live="polite" hidden></div></div>
    <div class="vc-x" aria-hidden="true">${labels.map((l, i) => (show.has(i) ? `<span style="left:${px(i).toFixed(2)}%">${esc(l)}</span>` : '')).join('')}</div>
    ${legend}
    <figcaption class="sr-only">${esc(title)}</figcaption>
  </figure>`;
}
const legendOf = (list) => (list.length > 1 ? `<div class="vc-legend">${list.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '');
const hitsOf = (labels, list, xAt) => labels.map((l, i) => {
  const vals = list.map((s) => `${encodeURIComponent(s.name)}:${s.values[i] || 0}:${encodeURIComponent(s.color)}`).join('|');
  return `<span class="vc-hit" tabindex="0" data-x="${xAt(i).toFixed(2)}" data-label="${esc(l)}" data-vals="${esc(vals)}" aria-label="${esc(l)}: ${esc(list.map((s) => `${s.name} ${s.values[i] || 0}`).join(', '))}"></span>`;
}).join('');

// Smooth lines with a soft fill: series [{ name, values, color }].
export function areaChart({ labels, series, height = 200, title = '' }) {
  const W = 1000, H = 300, n = labels.length, top = niceTop(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i) => (n === 1 ? W / 2 : (i * W) / (n - 1)), y = (v) => H - (H * v) / top;
  const grid = [0, 1, 2, 3, 4].map((k) => `<line x1="0" x2="${W}" y1="${(H * k) / 4}" y2="${(H * k) / 4}" class="cg" vector-effect="non-scaling-stroke"/>`).join('');
  const paths = series.map((s) => {
    const d = smooth(s.values.map((v, i) => [x(i), y(v)]), H);
    return `<path d="${d} L${x(n - 1)},${H} L${x(0)},${H} Z" fill="${s.color}" opacity=".10"/><path d="${d}" class="cline" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke" pathLength="1"/>`;
  }).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grid}${paths}</svg>`;
  const dots = series.map((s, k) => `<i class="vc-dot" data-k="${k}" style="--c:${s.color}" hidden></i>`).join('');
  return frame({ labels, top, svg, dots, title, height, legend: legendOf(series), hits: hitsOf(labels, series, (i) => (n === 1 ? 50 : (i / (n - 1)) * 100)) }).replace('class="chart"', `class="chart vc-area" data-top="${top}"`);
}

// Stacked bars, one per day: groups [{ name, values, color }].
export function barChart({ labels, groups, height = 200, title = '' }) {
  const W = 1000, H = 300, n = labels.length, totals = labels.map((_, i) => groups.reduce((a, g) => a + (g.values[i] || 0), 0));
  const top = niceTop(Math.max(0, ...totals)), slot = W / n, bw = Math.min(46, slot * 0.56);
  const grid = [0, 1, 2, 3, 4].map((k) => `<line x1="0" x2="${W}" y1="${(H * k) / 4}" y2="${(H * k) / 4}" class="cg" vector-effect="non-scaling-stroke"/>`).join('');
  const bars = labels.map((_, i) => {
    let acc = 0;
    return groups.map((g) => {
      const v = g.values[i] || 0; if (!v) return '';
      const h = (H * v) / top, yTop = H - ((acc + v) * H) / top; acc += v;
      return `<rect class="cbar" x="${(slot * i + (slot - bw) / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${g.color}"/>`;
    }).join('');
  }).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grid}${bars}</svg>`;
  const at = (i) => ((i + 0.5) / n) * 100;
  return frame({ labels, top, svg, title, height, legend: legendOf(groups), hits: hitsOf(labels, groups, at) })
    .replace('class="chart"', `class="chart vc-bars" data-top="${top}"`)
    .replace(/<div class="vc-x"[^>]*>[\s\S]*?<\/div>/, () => { const show = labelIndexes(n, 5); return `<div class="vc-x" aria-hidden="true">${labels.map((l, i) => (show.has(i) ? `<span style="left:${at(i).toFixed(2)}%">${esc(l)}</span>` : '')).join('')}</div>`; });
}

let bound = false;
export function bindCharts() {
  if (bound || typeof document === 'undefined') return; bound = true;
  const show = (hit) => {
    const box = hit.closest('.chart'), plot = box.querySelector('.vc-plot'), tip = box.querySelector('.vc-tip'), top = Number(box.dataset.top) || 4;
    const X = Number(hit.dataset.x), rows = hit.dataset.vals.split('|').map((p) => { const [n, v, c] = p.split(':'); return { n: decodeURIComponent(n), v: Number(v), c: decodeURIComponent(c) }; });
    const cur = box.querySelector('.vc-cursor'); cur.hidden = false; cur.style.left = X + '%';
    box.querySelectorAll('.vc-dot').forEach((d) => { const r = rows[Number(d.dataset.k)]; d.hidden = false; d.style.left = X + '%'; d.style.top = (1 - (r?.v || 0) / top) * 100 + '%'; });
    tip.innerHTML = `<b>${esc(hit.dataset.label)}</b>${rows.map((r) => `<span><i style="background:${esc(r.c)}"></i>${esc(r.n)}: <b>${r.v}</b></span>`).join('')}`;
    tip.hidden = false;
    const w = plot.clientWidth, x = (X / 100) * w;
    tip.style.left = Math.max(0, Math.min(w - tip.offsetWidth, x - tip.offsetWidth / 2)) + 'px';
  };
  const hide = (box) => { if (!box) return; box.querySelector('.vc-tip').hidden = true; box.querySelector('.vc-cursor').hidden = true; box.querySelectorAll('.vc-dot').forEach((d) => { d.hidden = true; }); };
  document.addEventListener('pointerover', (e) => { const h = e.target.closest?.('.vc-hit'); if (h) show(h); });
  document.addEventListener('pointerdown', (e) => { const h = e.target.closest?.('.vc-hit'); if (h) show(h); });
  document.addEventListener('focusin', (e) => { const h = e.target.closest?.('.vc-hit'); if (h) show(h); });
  document.addEventListener('pointerout', (e) => { const box = e.target.closest?.('.chart'); if (box && !box.contains(e.relatedTarget)) hide(box); });
  document.addEventListener('focusout', (e) => { const box = e.target.closest?.('.chart'); if (box && !box.contains(e.relatedTarget)) hide(box); });
}
