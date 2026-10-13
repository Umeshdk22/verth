// Renders one Verth Short: 1080×1920, voice-over with word-by-word captions, music that turns
// with the story, sound effects and scene transitions.
//   node video/shorts.mjs <id> <en|hi> <voice dir with <id>-<lang>-1..9.wav | "fake"> <out.mp4>
// STILLS=<dir> saves a few frames per line instead of the video (for checking the look).
import { existsSync, symlinkSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [ID, LANG, VOICE, OUT] = process.argv.slice(2);
const FPS = 30, TMP = OUT.replace(/\.mp4$/, '') + '-tmp'; mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const li = LANG === 'hi' ? 1 : 0;
const script = JSON.parse(readFileSync('video/shorts-script.json', 'utf8'))[ID].lines.map((l) => l[li]);

// A breath before each line; a little longer where the story turns.
const GAP = [0.5, 0.45, 0.35, 0.5, 0.45, 0.5, 0.45, 0.5, 0.55];
const lines = []; let cursor = 0;
script.forEach((text, n) => {
  const clean = `${TMP}/v${n + 1}.wav`;
  if (VOICE === 'fake') ff(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=mono`, '-t', String(Math.max(1.6, text.length / (LANG === 'hi' ? 15 : 16))), clean]);
  else ff(['-i', `${VOICE}/${ID}-${LANG}-${n + 1}.wav`, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,highpass=f=70,aresample=48000', '-ac', '1', clean]);
  cursor += GAP[n] ?? 0.45;
  const d = dur(clean);
  lines.push({ text: text.replace(/verth dot in|वर्थ डॉट इन/i, 'verth.in'), file: clean, start: +cursor.toFixed(3), end: +(cursor + d).toFixed(3) });
  cursor += d;
});
const total = +(cursor + 2.2).toFixed(2);

if (existsSync('video/_short')) rmSync('video/_short');
const port = 8800 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/video/shorts.html`);
  await page.evaluate((p) => window.setup(p), { id: ID, lang: LANG, lines: lines.map(({ text, start, end }) => ({ text, start, end })), total });
  if (errs.length) throw new Error(errs.join('\n'));
  const events = await page.evaluate(() => window.sfx()), turn = await page.evaluate(() => window.turn());
  if (process.env.STILLS) {
    mkdirSync(process.env.STILLS, { recursive: true });
    const ts = lines.flatMap((l) => [l.start + (l.end - l.start) * 0.25, l.start + (l.end - l.start) * 0.85]);
    for (const [k, t] of ts.entries()) { await page.evaluate((x) => window.render(x), t); await page.screenshot({ path: `${process.env.STILLS}/${ID}-${LANG}-${String(k).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 80 }); }
    console.log('stills', ts.length, 'total', total);
  } else {
    // Audio: voice, music (ducked under the voice) and sound effects.
    const voice = `${TMP}/voice.wav`, music = `${TMP}/music.wav`, fx = `${TMP}/sfx.wav`, mix = `${TMP}/mix.m4a`;
    ff([...lines.flatMap((l) => ['-i', l.file]), '-filter_complex', `${lines.map((l, i) => `[${i}]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`).join(';')};${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${total}`, '-ar', '48000', '-ac', '1', voice]);
    const mood = { sboss: 'boss', spapa: 'papa', sqr: 'qr', sarrest: 'arrest' }[ID];
    execFileSync('python3', ['video/shorts_music.py', 'music', mood, String(total), String(turn), music]);
    writeFileSync(`${TMP}/events.json`, JSON.stringify(events));
    execFileSync('python3', ['video/shorts_music.py', 'sfx', `${TMP}/events.json`, String(total), fx]);
    ff(['-i', voice, '-i', music, '-i', fx, '-filter_complex',
      `[0]aformat=channel_layouts=stereo,asplit=2[v][key];[1]volume=0.22,afade=t=out:st=${(total - 1.8).toFixed(2)}:d=1.8[m];[m][key]sidechaincompress=threshold=0.03:ratio=4:attack=40:release=700[md];[2]volume=0.55[s];[v][md][s]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,alimiter=limit=0.84:level=false`,
      '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-t', String(total), mix]);
    const silent = `${TMP}/video.mp4`;
    const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-g', '60', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round(total * FPS);
    for (let f = 0; f < n; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
      if (f % 300 === 0) console.log(`${ID}-${LANG} frame ${f}/${n}`);
    }
    enc.stdin.end();
    await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
    ff(['-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', OUT]);
    console.log('done', OUT, total + 's');
  }
} finally { await browser.close(); server.kill(); }
