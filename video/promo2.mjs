// Renders the Verth walkthrough video: 1920×1080, real website screens, a voice-over with
// subtitles and soft piano underneath. Every frame is drawn from an exact time.
//   node video/promo2.mjs <laptop shots dir> <voice dir with final-1..9.wav> <out.mp4>
import { existsSync, symlinkSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [SHOTS, VOICE, OUT] = process.argv.slice(2);
const FPS = 30, TMP = OUT.replace(/\.mp4$/, '') + '-tmp'; mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const script = JSON.parse(readFileSync('video/promo-script.json', 'utf8')).promo.lines.map((l) => l[0]);
// Pauses before each line: a little breathing room, longer where the picture changes a lot.
const GAP_BEFORE = [0.7, 0.45, 0.7, 0.85, 0.7, 0.7, 0.6, 0.7, 0.8];
const lines = []; let cursor = 0;
script.forEach((text, n) => {
  const raw = `${VOICE}/final-${n + 1}.wav`, clean = `${TMP}/v${n + 1}.wav`;
  ff(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,highpass=f=70,aresample=48000', '-ac', '1', clean]);
  cursor += GAP_BEFORE[n];
  const d = dur(clean); lines.push({ text, file: clean, start: cursor, end: cursor + d }); cursor += d;
});
const total = cursor + 3.2;
// Voice track, then soft piano that dips under the voice.
const voice = `${TMP}/voice.wav`, music = `${TMP}/music.wav`, mix = `${TMP}/mix.m4a`;
ff([...lines.flatMap((l) => ['-i', l.file]), '-filter_complex', `${lines.map((l, i) => `[${i}]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`).join(';')};${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}`, '-ar', '48000', '-ac', '1', voice]);
execFileSync('python3', ['video/music.py', total.toFixed(2), music]);
ff(['-i', voice, '-i', music, '-filter_complex',
  '[0]aformat=channel_layouts=stereo,asplit=2[v][key];[1]volume=0.16,afade=t=out:st=' + (total - 2.5).toFixed(2) + ':d=2.5[m];[m][key]sidechaincompress=threshold=0.02:ratio=5:attack=40:release=700[md];[v][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=8',
  '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', mix]);

if (existsSync('video/_promo')) rmSync('video/_promo');
symlinkSync(SHOTS, 'video/_promo');
const server = spawn('python3', ['-m', 'http.server', '8797', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:8797/video/promo2.html');
  const taps = existsSync(SHOTS + '/taps.json') ? JSON.parse(readFileSync(SHOTS + '/taps.json', 'utf8')) : {};
  await page.evaluate((p) => window.setup(p), { lines: lines.map(({ text, start, end }) => ({ text, start, end })), total, taps });
  const silent = `${TMP}/video.mp4`;
  const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${n}`);
  }
  enc.stdin.end();
  await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
  ff(['-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', OUT]);
  console.log('done', OUT, total.toFixed(1) + 's');
} finally { await browser.close(); server.kill(); rmSync('video/_promo'); }
