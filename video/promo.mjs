// Renders the Verth promo video for LinkedIn and other social media: 1080×1350 (4:5), 30 fps,
// original music, every frame drawn from an exact time so playback never stutters.
//   node video/promo.mjs <frames dir> <out.mp4>
// frames: phone screens from the app test (VSHOTS=dir) plus wide-home.png from its laptop shots.
import { existsSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [FRAMES, OUT, W = '1080', H = '1350'] = process.argv.slice(2);
const FPS = 30, TMP = OUT.replace(/\.mp4$/, '');
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
if (existsSync('video/_frames')) rmSync('video/_frames');
symlinkSync(FRAMES, 'video/_frames');
const server = spawn('python3', ['-m', 'http.server', '8798', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  await page.goto('http://127.0.0.1:8798/video/promo.html');
  const taps = existsSync(FRAMES + '/frames.json') ? JSON.parse(readFileSync(FRAMES + '/frames.json', 'utf8')) : {};
  await page.evaluate((t) => window.setup(t), taps);
  const total = await page.evaluate(() => window.TOTAL);
  const silent = TMP + '-video.mp4', music = TMP + '-music.wav';
  const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${n}`);
  }
  enc.stdin.end();
  await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
  execFileSync('python3', ['video/promo_music.py', String(total), music]);
  // Social platforms play around −14 LUFS; AAC 192k stereo; moov atom first for instant start.
  ff(['-i', silent, '-i', music, '-filter_complex', '[1]loudnorm=I=-14:TP=-1.5:LRA=7[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT]);
  console.log('done', OUT);
} finally { await browser.close(); server.kill(); rmSync('video/_frames'); }
