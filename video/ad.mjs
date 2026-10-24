// Renders the Verth brand ad (no voice): 1080×1920, music + sound effects.
//   node video/ad.mjs <en|hi> <out.mp4>      STILLS=<dir> "t1,t2,…" saves frames instead.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [LANG, OUT] = process.argv.slice(2);
const FPS = 30, TMP = OUT.replace(/\.mp4$/, '') + '-tmp'; mkdirSync(TMP, { recursive: true });
const ff = (a) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a]);
const port = 8700 + Math.floor(Math.random() * 90);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: Number(process.env.DSF || 1) });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/video/${process.env.PAGE || 'ad'}.html`);
  await page.evaluate((lang) => window.setup({ lang }), LANG);
  if (errs.length) throw new Error(errs.join('\n'));
  const total = await page.evaluate(() => window.total());
  if (process.env.STILLS) {
    mkdirSync(process.env.STILLS, { recursive: true });
    for (const [k, t] of process.argv[4].split(',').map(Number).entries()) { await page.evaluate((x) => window.render(x), t); await page.screenshot({ path: `${process.env.STILLS}/${LANG}-${String(k).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 80 }); }
  } else {
    const music = `${TMP}/music.wav`, fx = `${TMP}/sfx.wav`, mix = `${TMP}/mix.m4a`;
    execFileSync('python3', ['video/shorts_music.py', 'music', process.env.MOOD || 'ad', String(total), process.env.TURN || '4.2', music]);
    writeFileSync(`${TMP}/events.json`, JSON.stringify(await page.evaluate(() => window.sfx())));
    execFileSync('python3', ['video/shorts_music.py', 'sfx', `${TMP}/events.json`, String(total), fx]);
    ff(['-i', music, '-i', fx, '-filter_complex', `[0]volume=0.8,afade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.6[m];[1]volume=0.6[s];[m][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,alimiter=limit=0.84:level=false`,
      '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-t', String(total), mix]);
    const silent = `${TMP}/video.mp4`;
    const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-g', '60', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round(total * FPS);
    for (let f = 0; f < n; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
      if (f % 150 === 0) console.log(`${LANG} frame ${f}/${n}`);
    }
    enc.stdin.end();
    await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
    ff(['-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', OUT]);
    console.log('done', OUT, total + 's');
  }
} finally { await browser.close(); server.kill(); }
