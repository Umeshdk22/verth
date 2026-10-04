// Makes the voice-over for the help videos, one clip per line, by asking the Verth server
// (Gemini text-to-speech). Each clip is then transcribed to check the right words were spoken.
// Run by .github/workflows/voices.yml, which sets TTS_TOKEN for the duration of the job.
// Writes video/voice/<video>-<lang>-<n>.wav and video/voice/report.json. Existing clips are kept.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const API = process.env.API || 'https://verth-pay.umeshdk22.workers.dev';
const TOKEN = process.env.TTS_TOKEN, ONLY = (process.env.ONLY || 'all').split(',').map((x) => x.trim());
const REDO = process.env.REDO === '1';
const VOICE = { en: process.env.VOICE_EN || 'Kore', hi: process.env.VOICE_HI || 'Kore' };
const STYLE = { en: 'Say in a warm, friendly, clear voice, at a natural pace: ', hi: 'गर्मजोशी भरी, साफ़ आवाज़ में, सामान्य गति से कहिए: ' };
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
const words = (t) => String(t).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
function match(line, heard) { const a = words(line), b = new Set(words(heard)); return a.length ? a.filter((w) => b.has(w)).length / a.length : 0; }
const extra = (line, heard) => words(heard).length - words(line).length;

let calls = 0;
for (const [id, v] of Object.entries(scripts)) {
  for (const [li, lang] of ['en', 'hi'].entries()) {
    if (!ONLY.includes('all') && !ONLY.includes(id) && !ONLY.includes(lang) && !ONLY.includes(`${id}-${lang}`)) continue;
    for (const [n, pair] of v.lines.entries()) {
      const key = `${id}-${lang}-${n + 1}`, file = `video/voice/${key}.wav`, line = pair[li];
      if (!REDO && existsSync(file) && report[key]?.ok && report[key]?.line === line) continue;
      let done = false;
      for (let attempt = 1; attempt <= 4 && !done; attempt++) {
        if (calls++) await sleep(attempt > 1 ? 40000 : 21000); // free-tier per-minute limits
        const style = attempt >= 3 ? '' : STYLE[lang]; // if the style words get read out, drop them
        const out = await post({ text: style + line, voice: VOICE[lang] }).catch((e) => ({ error: String(e) }));
        if (!out.audio) { console.log(`::warning::${key} attempt ${attempt}: ${out.error}`); report[key] = { ok: false, line, error: out.error, models: out.models }; continue; }
        const bytes = Buffer.from(out.audio, 'base64');
        const rate = Number((out.mime || '').match(/rate=(\d+)/)?.[1] || 24000);
        const file1 = bytes.subarray(0, 4).toString() === 'RIFF' ? bytes : wav(bytes, rate);
        await sleep(4000);
        const t = await post({ audio: file1.toString('base64'), mime: 'audio/wav' }).catch((e) => ({ error: String(e) }));
        const score = t.text ? match(line, t.text) : null, more = t.text ? extra(line, t.text) : 0;
        const good = score == null || (score >= 0.6 && more <= 4);
        report[key] = { ok: good, line, heard: t.text || '', score, model: out.model, voice: VOICE[lang], style: !!style };
        if (good) { writeFileSync(file, file1); done = true; console.log(`${key} ok (${score == null ? 'not checked' : Math.round(score * 100) + '%'})`); }
        else console.log(`::warning::${key} attempt ${attempt}: heard "${(t.text || '').slice(0, 120)}" (${Math.round(score * 100)}%, ${more} extra words)`);
      }
      writeFileSync('video/voice/report.json', JSON.stringify(report, null, 1));
    }
  }
}
const bad = Object.entries(report).filter(([, r]) => !r.ok);
console.log(`::notice title=Voices::${Object.keys(report).length - bad.length} clips ok, ${bad.length} failed`);
if (bad.length) console.log(`::warning title=Voices not made::${JSON.stringify(bad.map(([k, r]) => [k, r.error || r.heard])).slice(0, 1500)}`);
