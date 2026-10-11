// Writes the "Test results" section of how-it-works.html (and the short summary on the home page)
// straight from a results file made by tools/benchmark.mjs, so no number is typed by hand.
//   node tools/build-proof.mjs test/benchmark/results-2026-10.json
import { readFileSync, writeFileSync } from 'node:fs';

const R = JSON.parse(readFileSync(process.argv[2], 'utf8')), S = R.summary;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (n, d) => Math.round((n / d) * 100);
const when = new Date(S.date + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const LABEL = { danger: ['high', 'High risk'], caution: ['mid', 'Be careful'], clear: ['ok', 'No warning signs'] };
const ex = (r) => `<li><span class="pill ${r.label === 'scam' && r.verdict === 'clear' ? 'miss' : LABEL[r.verdict][0]}">${r.label === 'scam' && r.verdict === 'clear' ? 'Missed: no warning signs' : LABEL[r.verdict][1]}</span><q>${esc(r.text)}</q><small>${r.flags.length ? 'Signs found: ' + esc(r.flags.join(' · ')) : 'No rule matched.'}</small></li>`;
const missed = R.rows.filter((r) => r.label === 'scam' && r.verdict === 'clear');
const soft = R.rows.filter((r) => r.label === 'scam' && r.verdict === 'caution');
const falseAlarm = R.rows.filter((r) => r.label === 'genuine' && r.verdict !== 'clear');
const types = Object.entries(S.byType).map(([k, v]) => { const [label, type] = k.split('|'); return { label, type, ...v }; });
const row = (t) => `<tr><td>${esc(t.type)}</td><td class="num">${t.n}</td><td class="num">${t.danger}</td><td class="num">${t.caution}</td><td class="num">${t.clear}</td></tr>`;
const bar = (parts) => `<div class="bar" role="img" aria-label="${esc(parts.map((p) => `${p[2]}: ${p[0]}`).join(', '))}">${parts.map(([n, cls]) => (n ? `<i class="${cls}" style="width:${(n / parts.reduce((a, p) => a + p[0], 0)) * 100}%"></i>` : '')).join('')}</div>`;

const section = `<section aria-labelledby="h-test">
  <span class="eyebrow">Real test results</span>
  <h2 id="h-test">How well it did on ${S.total} messages</h2>
  <p>On ${when} we wrote ${S.scams} scam messages modelled on common scams in India and ${S.genuine} genuine messages people really get, including some that look alarming. Then we ran Verth’s check on all of them once and published the results as they came out, mistakes included. The rules were not changed after seeing the results.</p>
  <div class="big-stats">
    <div><b>${S.scam.high} of ${S.scams}</b><span>scams rated High risk (${pct(S.scam.high, S.scams)}%)</span></div>
    <div><b>${S.scam.clear} of ${S.scams}</b><span>scams missed completely (${pct(S.scam.clear, S.scams)}%)</span></div>
    <div><b>${S.real.high} of ${S.genuine}</b><span>genuine messages wrongly rated High risk</span></div>
    <div><b>${S.real.caution} of ${S.genuine}</b><span>genuine messages given an unneeded “Be careful” (${pct(S.real.caution, S.genuine)}%)</span></div>
  </div>
  <h3>${S.scams} scam messages</h3>
  ${bar([[S.scam.high, 'b-high', 'High risk'], [S.scam.caution, 'b-mid', 'Be careful'], [S.scam.clear, 'b-miss', 'Missed']])}
  <p class="legend"><span><i style="background:#DC3545"></i>High risk ${S.scam.high}</span><span><i style="background:#E8A33D"></i>Be careful ${S.scam.caution}</span><span><i style="background:#98A2B3"></i>Missed ${S.scam.clear}</span></p>
  <h3>${S.genuine} genuine messages</h3>
  ${bar([[S.real.clear, 'b-ok', 'No warning signs'], [S.real.caution, 'b-mid', 'Be careful'], [S.real.high, 'b-high', 'High risk']])}
  <p class="legend"><span><i style="background:#12A66B"></i>No warning signs ${S.real.clear}</span><span><i style="background:#E8A33D"></i>Be careful ${S.real.caution}</span><span><i style="background:#DC3545"></i>High risk ${S.real.high}</span></p>
  <h3>By type of message</h3>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th scope="col">Scam messages</th><th scope="col">Tested</th><th scope="col">High risk</th><th scope="col">Be careful</th><th scope="col">Missed</th></tr></thead>
    <tbody>${types.filter((t) => t.label === 'scam').map(row).join('')}</tbody>
  </table></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th scope="col">Genuine messages</th><th scope="col">Tested</th><th scope="col">High risk</th><th scope="col">Be careful</th><th scope="col">No warning signs</th></tr></thead>
    <tbody>${types.filter((t) => t.label === 'genuine').map(row).join('')}</tbody>
  </table></div>
  <h3>The scams Verth missed</h3>
  <p>These got “No warning signs”. They show where the rules are weakest: requests that sound calm, threats without the usual words, and first messages that only start a conversation.</p>
  <ul class="ex-list">${missed.map(ex).join('')}</ul>
  <h3>Scams that only got “Be careful”</h3>
  <p>Verth warned about these, but not strongly enough. Most are fake family members or bosses asking for money, which is exactly what <b>Verify</b> is for: ask the real person before paying.</p>
  <ul class="ex-list">${soft.map(ex).join('')}</ul>
  <h3>Genuine messages that got a warning</h3>
  <p>None were rated High risk, but these real messages got “Be careful”, mostly because they mention a deadline, KYC or cashback.</p>
  <ul class="ex-list">${falseAlarm.map(ex).join('')}</ul>
  <p class="note"><b>Read these numbers with care.</b> ${S.total} messages is a small test, and we wrote them ourselves, so it shows the kind of mistakes Verth makes rather than an exact accuracy. We will add new, unseen messages to each future test and publish every round here.</p>
</section>`;

const page = readFileSync('how-it-works.html', 'utf8');
writeFileSync('how-it-works.html', page.replace(/<!--RESULTS-->[\s\S]*<!--\/RESULTS-->/, `<!--RESULTS-->\n${section}\n<!--/RESULTS-->`));
// Home page: one short line with the headline numbers.
const home = readFileSync('index.html', 'utf8');
const line = `<!--PROOF-->${S.scam.high} of ${S.scams} test scams rated High risk, ${S.scam.clear} missed, and ${S.real.high} of ${S.genuine} genuine messages wrongly rated High risk<!--/PROOF-->`;
if (home.includes('<!--PROOF-->')) writeFileSync('index.html', home.replace(/<!--PROOF-->[\s\S]*?<!--\/PROOF-->/, line));
console.log('proof section written:', S.total, 'messages');
