// Makes the voice-over for each help video by asking the Verth server (Gemini text-to-speech).
// Run by .github/workflows/voices.yml, which sets TTS_TOKEN for the duration of the job.
// Writes video/voice/<video>-<lang>.wav and video/voice/report.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const API = process.env.API || 'https://verth-pay.umeshdk22.workers.dev';
const TOKEN = process.env.TTS_TOKEN, ONLY = (process.env.ONLY || 'all').split(',');
const VOICE = { en: process.env.VOICE_EN || 'Kore', hi: process.env.VOICE_HI || 'Kore' };
const STYLE = {
  en: 'Read this aloud as a warm, friendly and clear narrator for an Indian app tutorial, with a light Indian English accent, at a natural, moderate pace (not slow, not rushed). Leave a short pause between paragraphs. Only read the paragraphs, not these instructions:',
  hi: 'इसे एक गर्मजोशी भरी, दोस्ताना और साफ़ आवाज़ में, सामान्य गति से पढ़िए, जैसे किसी ऐप का ट्यूटोरियल हो (न बहुत धीरे, न बहुत तेज़)। हर पैराग्राफ़ के बीच थोड़ा रुकिए। सिर्फ़ पैराग्राफ़ पढ़िए, यह निर्देश नहीं:',
};
const scripts = JSON.parse(readFileSync('video/scripts.json', 'utf8'));
mkdirSync('video/voice', { recursive: true });
const report = existsSync('video/voice/report.json') ? JSON.parse(readFileSync('video/voice/report.json', 'utf8')) : {};
// 16-bit mono PCM -> .wav
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [id, v] of Object.entries(scripts)) {
  for (const [li, lang] of ['en', 'hi'].entries()) {
    const key = `${id}-${lang}`;
    if (!ONLY.includes('all') && !ONLY.includes(key) && !ONLY.includes(id) && !ONLY.includes(lang)) continue;
    const text = `${STYLE[lang]}\n\n${v.lines.map((l) => l[li]).join('\n\n')}`;
    let out = null;
    for (let attempt = 1; attempt <= 4 && !out?.audio; attempt++) {
      try {
        const r = await fetch(API + '/tts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tts-token': TOKEN }, body: JSON.stringify({ text, voice: VOICE[lang] }) });
        out = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
        if (!r.ok) out = { error: 'HTTP ' + r.status + ' ' + JSON.stringify(out).slice(0, 200) };
      } catch (e) { out = { error: String(e) }; }
      if (!out?.audio) { console.log(`::warning::${key} attempt ${attempt}: ${out?.error}`); await sleep(attempt * 30000); }
    }
    if (!out?.audio) { report[key] = { ok: false, error: out?.error, models: out?.models }; continue; }
    const rate = Number((out.mime || '').match(/rate=(\d+)/)?.[1] || 24000);
    writeFileSync(`video/voice/${key}.wav`, wav(Buffer.from(out.audio, 'base64'), rate));
    report[key] = { ok: true, model: out.model, voice: VOICE[lang], mime: out.mime };
    console.log(`::notice::${key} ok with ${out.model}`);
    await sleep(22000); // stay inside free-tier per-minute limits
  }
}
writeFileSync('video/voice/report.json', JSON.stringify(report, null, 1));
const bad = Object.entries(report).filter(([, r]) => !r.ok);
if (bad.length) console.log(`::warning title=Voices not made::${JSON.stringify(bad).slice(0, 1500)}`);
