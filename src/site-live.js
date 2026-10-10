// Website: the live "scams caught by Verth" chart. Real counts from the Verth server (/stats),
// refreshed every minute while the page is open.
import { areaChart, bindCharts } from './charts.js';
bindCharts();
import { PAYMENTS } from './config.js';

const box = document.getElementById('live-chart');
const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
async function load() {
  if (!box) return;
  try {
    const r = await fetch(PAYMENTS.api.replace(/\/+$/, '') + '/stats', { cache: 'no-store' });
    if (!r.ok) throw new Error('stats');
    const j = await r.json(), days = j.days || [];
    document.getElementById('live-total').textContent = String(j.total ?? 0);
    document.getElementById('live-today').textContent = String(days.at(-1)?.n ?? 0);
    const labels = days.map((d) => fmt(d.day));
    box.innerHTML = `<h3>Scams found each day</h3>${areaChart({ labels, series: [{ name: 'scams found', values: days.map((d) => d.n), color: '#16A34A' }], height: 190, title: 'Scams Verth found each day in the last 14 days' })}<p class="lc-note">Updated ${new Date(j.updated || Date.now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} India time</p>`;
  } catch {
    if (!box.querySelector('.chart')) box.innerHTML = '<p class="lc-wait">Live numbers aren’t available right now. Try again in a minute.</p>';
  }
}
load();
setInterval(() => { if (!document.hidden) load(); }, 60000);

