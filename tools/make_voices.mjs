// Makes the voice-over for the help videos, one clip per line, by asking the Verth server
// (Gemini text-to-speech). Each clip is then transcribed to check the right words were spoken.
// Run by .github/workflows/voices.yml, which sets TTS_TOKEN for the duration of the job.
// Writes video/voice/<video>-<lang>-<n>.wav and video/voice/report.json. Existing clips are kept.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const API = process.env.API || 'https://verth-pay.umeshdk22.workers.dev';
const TOKEN = process.env.TTS_TOKEN, ONLY = (process.env.ONLY || 'all').split(',').map((x) => x.trim());
const REDO = process.env.REDO === '1';
const VOICE = { en: process.env.VOICE_EN || 'Kore', hi: process.env.VOICE_HI || 'Kore' };
// Hindi style words get read out loud, so Hindi lines go in plain.
const STYLE = { en: 'Say in a warm, friendly, clear voice, at a natural pace: ', hi: '' };
const scripts = JSON.parse(readFileSync('video/scripts.json', 'utf8'));
mkdirSync('video/voice', { recursive: true });
const report = existsSync('video/voice/report.json') ? JSON.parse(readFileSync('video/voice/report.json', 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function post(body) {
  const r = await fetch(API + '/tts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tts-token': TOKEN }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { error: `HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}` };
}
// Words of the script line vs the transcript: a rough match score from 0 to 1.
const words = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u093c\u0901\u0902]/g, '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
function match(line, heard) { const a = words(line), b = new Set(words(heard)); return a.length ? a.filter((w) => b.has(w)).length / a.length : 0; }
const extra = (line, heard) => words(heard).length - words(line).length;

// Reads 16-bit mono PCM out of a .wav file.
function pcmOf(buf) {
  let o = 12, rate = 24000;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(o + 12);
    if (id === 'data') return { rate, pcm: buf.subarray(o + 8, Math.min(buf.length, o + 8 + size)) };
    o += 8 + size + (size & 1);
  }
  return { rate, pcm: buf.subarray(44) };
}
// Splits one recording of a whole video into its lines, at the pauses that best fit where each
// line should end (by its length). Returns the cut times in seconds, or null.
export function splitPoints(pcm, rate, lines) {
  const hop = Math.round(rate / 100), n = Math.floor(pcm.length / 2 / hop), db = new Float64Array(n);
  let peak = -120;
  for (let f = 0; f < n; f++) { let e = 0; for (let k = 0; k < hop; k++) { const v = pcm.readInt16LE((f * hop + k) * 2) / 32768; e += v * v; } db[f] = 10 * Math.log10(e / hop + 1e-12); peak = Math.max(peak, db[f]); }
  const quiet = (f) => db[f] < peak - 35;
  let a = 0, b = n - 1; while (a < n && quiet(a)) a++; while (b > a && quiet(b)) b--;
  const cands = [];
  for (let f = a; f <= b; f++) if (quiet(f)) { let g = f; while (g <= b && quiet(g)) g++; if (g - f >= 18) cands.push({ t: (f + g) / 2 / 100, len: (g - f) / 100 }); f = g; }
  const need = lines.length - 1; if (cands.length < need) return null;
  const chars = lines.map((l) => l.length), all = chars.reduce((x, y) => x + y, 0), t0 = a / 100, span = (b - a) / 100;
  let acc = 0; const exp = chars.slice(0, -1).map((c) => (acc += c, t0 + (span * acc) / all));
  // best increasing choice of `need` pauses: near the expected spot, longer pauses preferred
  const cost = (k, j) => Math.abs(cands[j].t - exp[k]) - 2.5 * cands[j].len;
  const D = Array.from({ length: need }, () => new Array(cands.length).fill(Infinity)), P = Array.from({ length: need }, () => new Array(cands.length).fill(-1));
  for (let j = 0; j < cands.length; j++) D[0][j] = cost(0, j);
  for (let k = 1; k < need; k++) for (let j = k; j < cands.length; j++) for (let i = k - 1; i < j; i++) { const v = D[k - 1][i] + cost(k, j); if (v < D[k][j]) { D[k][j] = v; P[k][j] = i; } }
  let j = -1, best = Infinity; for (let x = need - 1; x < cands.length; x++) if (D[need - 1][x] < best) { best = D[need - 1][x]; j = x; }
  const cuts = []; for (let k = need - 1; k >= 0; k--) { cuts.unshift(cands[j].t); j = P[k][j]; }
  return cuts;
}

let calls = 0, quota = false;
const isQuota = (e) => /\b429\b/.test(String(e || '')) && /quota/i.test(String(e || ''));
async function tts(text, lang) {
  if (calls++) await sleep(21000);
  const out = await post({ text, voice: VOICE[lang] }).catch((e) => ({ error: String(e) }));
  if (!out.audio) { if (isQuota(out.error)) quota = true; return { error: out.error }; }
  const bytes = Buffer.from(out.audio, 'base64'), rate = Number((out.mime || '').match(/rate=(\d+)/)?.[1] || 24000);
  return { file: bytes.subarray(0, 4).toString() === 'RIFF' ? bytes : wav(bytes, rate), model: out.model };
}
async function heard(file, lang) { await sleep(3000); const t = await post({ audio: file.toString('base64'), mime: 'audio/wav', lang }).catch(() => ({})); return t.text || ''; }

// Whole videos in one recording each (uses far fewer of the daily free voice requests).
for (const [id, v] of Object.entries(scripts)) {
  for (const [li, lang] of ['en', 'hi'].entries()) {
    if (quota) break;
    if (!ONLY.includes('all') && !ONLY.includes(id) && !ONLY.includes(lang) && !ONLY.includes(`${id}-${lang}`)) continue;
    const lines = v.lines.map((p) => p[li]), keys = lines.map((_, n) => `${id}-${lang}-${n + 1}`);
    const missing = keys.filter((k, n) => REDO || !existsSync(`video/voice/${k}.wav`) || report[k]?.line !== lines[n]);
    if (missing.length < 3) continue; // a few lines are fixed one by one below
    const r = await tts((lang === 'en' ? STYLE.en : '') + lines.join('\n\n'), lang);
    if (!r.file) { console.log(`::warning::${id}-${lang} whole: ${r.error}`); continue; }
    writeFileSync(`video/voice/${id}-${lang}.wav`, r.file);
    const { rate, pcm } = pcmOf(r.file), cuts = splitPoints(pcm, rate, lines);
    if (!cuts) { console.log(`::warning::${id}-${lang}: couldn't find the pauses between lines`); continue; }
    const edges = [0, ...cuts, pcm.length / 2 / rate];
    for (let n = 0; n < lines.length; n++) {
      const seg = wav(pcm.subarray(Math.round(edges[n] * rate) * 2, Math.round(edges[n + 1] * rate) * 2), rate);
      const h = await heard(seg, lang), score = h ? match(lines[n], h) : null, more = h ? extra(lines[n], h) : 0;
      const good = score == null || (score >= 0.55 && Math.abs(more) <= 5);
      report[keys[n]] = { ok: good, line: lines[n], heard: h, score, model: r.model, voice: VOICE[lang], from: 'whole' };
      if (good) writeFileSync(`video/voice/${keys[n]}.wav`, seg);
      else console.log(`::warning::${keys[n]} (split) heard "${h.slice(0, 100)}" (${Math.round((score || 0) * 100)}%)`);
    }
    writeFileSync('video/voice/report.json', JSON.stringify(report, null, 1));
    console.log(`${id}-${lang}: whole recording split into ${lines.length} lines`);
  }
}


for (const [id, v] of Object.entries(scripts)) {
  for (const [li, lang] of ['en', 'hi'].entries()) {
    if (!ONLY.includes('all') && !ONLY.includes(id) && !ONLY.includes(lang) && !ONLY.includes(`${id}-${lang}`)) continue;
    for (const [n, pair] of v.lines.entries()) {
      const key = `${id}-${lang}-${n + 1}`, file = `video/voice/${key}.wav`, line = pair[li];
      if (quota) break;
      if (existsSync(file) && report[key]?.ok && report[key]?.line === line) continue;
      let done = false;
      for (let attempt = 1; attempt <= 4 && !done; attempt++) {
        if (quota) break;
        const style = attempt >= 3 ? '' : STYLE[lang]; // if the style words get read out, drop them
        const out = await tts(style + line, lang);
        if (!out.file) { console.log(`::warning::${key} attempt ${attempt}: ${String(out.error).slice(0, 160)}`); report[key] = { ok: false, line, error: out.error }; continue; }
        const file1 = out.file, h = await heard(file1, lang);
        const score = h ? match(line, h) : null, more = h ? extra(line, h) : 0;
        const good = score == null || (score >= 0.6 && more <= 4);
        report[key] = { ok: good, line, heard: h, score, model: out.model, voice: VOICE[lang], style: !!style };
        if (good) { writeFileSync(file, file1); done = true; console.log(`${key} ok (${score == null ? 'not checked' : Math.round(score * 100) + '%'})`); }
        else console.log(`::warning::${key} attempt ${attempt}: heard "${h.slice(0, 120)}" (${Math.round(score * 100)}%, ${more} extra words)`);
      }
      writeFileSync('video/voice/report.json', JSON.stringify(report, null, 1));
    }
  }
}
if (quota) console.log('::warning title=Daily voice limit reached::Google’s free daily limit for voices was reached. Run this again tomorrow to finish the rest.');
const bad = Object.entries(report).filter(([, r]) => !r.ok);
console.log(`::notice title=Voices::${Object.keys(report).length - bad.length} clips ok, ${bad.length} failed`);
if (bad.length) console.log(`::warning title=Voices not made::${JSON.stringify(bad.map(([k, r]) => [k, r.error || r.heard])).slice(0, 1500)}`);
