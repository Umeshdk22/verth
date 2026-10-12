// Renders the WhatsApp video: offices, private chat, Pay safely and receipts, then scam check and
// UPI QR codes. 1920×1080, voice-over with subtitles, background music and scene transitions.
//   node video/promo4.mjs <laptop shots dir> <voice dir with wa-<lang>-1..10.wav> <en|hi> <out.mp4>
// Also writes <out>-whatsapp.mp4: the same video, smaller, for sending on WhatsApp.
import { existsSync, symlinkSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [SHOTS, VOICE, LANG, OUT] = process.argv.slice(2);
const FPS = 30, TMP = OUT.replace(/\.mp4$/, '') + '-tmp'; mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const li = LANG === 'hi' ? 1 : 0;
const script = JSON.parse(readFileSync('video/promo-script.json', 'utf8')).wa.lines.map((l) => l[li]);

const T = {
  en: {
    h1: 'Scammers now pretend to be <span class="hl">someone you trust.</span>',
    items: ['<b>“Sir, please pay this vendor today.</b> It’s urgent.”', '<b>“Papa, it’s me.</b> New number. Send money.”', '<b>“Your bank account</b> will be blocked tonight.”'],
    tag: 'Check before you pay.', free: 'Free for 7 days · No card needed',
    chaps: ['Your office group', 'Ask the real person', 'Private chat', 'Pay safely', 'Receipts', 'Scam check', 'UPI QR check'],
  },
  hi: {
    h1: 'ठग अब आपके <span class="hl">भरोसेमंद लोग</span> बनकर आते हैं।',
    items: ['<b>“सर, आज ही इस वेंडर को पेमेंट कर दीजिए।</b> अर्जेंट है।”', '<b>“पापा, मैं हूँ।</b> नया नंबर है, पैसे भेजो।”', '<b>“आपका बैंक खाता</b> आज रात बंद हो जाएगा।”'],
    tag: 'पैसे भेजने से पहले जाँचिए।', free: '7 दिन मुफ़्त · कोई कार्ड नहीं चाहिए',
    chaps: ['आपका ऑफ़िस ग्रुप', 'असली व्यक्ति से पूछें', 'प्राइवेट चैट', 'सुरक्षित पेमेंट', 'रसीद', 'स्कैम चेक', 'UPI QR जाँच'],
  },
}[LANG];
const ch = (n) => [String(n).padStart(2, '0'), T.chaps[n - 1]];
const scenes = [
  { kind: 'card', html: `<h1>${T.h1}</h1><div class="items">${T.items.map((x) => `<div>${x}</div>`).join('')}</div>` },
  { kind: 'card', html: `{LOGO}<div class="name">Verth</div><div class="tag hl">${T.tag}</div>` },
  { kind: 'screen', chap: ch(1), imgs: ['circle-approve', 'circle-company'] },
  { kind: 'screen', chap: ch(2), imgs: ['verify-incoming', 'verify-denied'] },
  { kind: 'screen', chap: ch(3), imgs: ['chat-list', 'chat-room'] },
  { kind: 'screen', chap: ch(4), imgs: ['chat-pay'] },
  { kind: 'screen', chap: ch(5), imgs: ['chat-receipt', 'chat-receipt-failed'] },
  { kind: 'screen', chap: ch(6), imgs: ['scan-filled', 'scan-result'] },
  { kind: 'screen', chap: ch(7), imgs: ['slide-photo'] },
  { kind: 'card', html: `{LOGO}<div class="name">Verth</div><div class="tag hl">${T.tag}</div><div class="url">verth.in</div><div class="small">${T.free}</div>` },
];
// Which screens get a pointer click: [screenshot, when in the line (0–1), where the pointer starts].
const clicks = { 2: ['circle-approve', 0.35, [1350, 760]], 3: ['verify-incoming', 0.55, [1340, 800]], 4: ['chat-list', 0.4, [1300, 820]], 5: ['chat-pay', 0.6, [1340, 820]], 7: ['scan-filled', 0.45, [1380, 790]] };

// Pauses before each line: room to breathe, a little longer where the picture changes.
const GAP_BEFORE = [1.2, 0.8, 1.0, 0.9, 0.9, 0.9, 0.9, 1.1, 0.9, 1.0];
const lines = []; let cursor = 0;
script.forEach((text, n) => {
  const raw = `${VOICE}/wa-${LANG}-${n + 1}.wav`, clean = `${TMP}/v${n + 1}.wav`;
  ff(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,highpass=f=70,aresample=48000', '-ac', '1', clean]);
  cursor += GAP_BEFORE[n];
  const d = dur(clean); lines.push({ text: text.replace(/verth dot in|verth डॉट इन/i, 'verth.in'), file: clean, start: cursor, end: cursor + d }); cursor += d;
});
const total = cursor + 3.6;
const voice = `${TMP}/voice.wav`, music = `${TMP}/music.wav`, mix = `${TMP}/mix.m4a`;
ff([...lines.flatMap((l) => ['-i', l.file]), '-filter_complex', `${lines.map((l, i) => `[${i}]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`).join(';')};${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}`, '-ar', '48000', '-ac', '1', voice]);
execFileSync('python3', ['video/promo_music.py', total.toFixed(2), music]);
ff(['-i', voice, '-i', music, '-filter_complex',
  '[0]aformat=channel_layouts=stereo,asplit=2[v][key];[1]volume=0.2,afade=t=out:st=' + (total - 2.5).toFixed(2) + ':d=2.5[m];[m][key]sidechaincompress=threshold=0.03:ratio=3.5:attack=60:release=900[md];[v][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=8',
  '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', mix]);

if (existsSync('video/_promo')) rmSync('video/_promo');
symlinkSync(SHOTS, 'video/_promo');
const port = 8790 + (LANG === 'hi' ? 1 : 0);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${port}/video/promo4.html`);
  const taps = existsSync(SHOTS + '/taps.json') ? JSON.parse(readFileSync(SHOTS + '/taps.json', 'utf8')) : {};
  await page.evaluate((p) => window.setup(p), { lang: LANG, scenes, clicks, subsOff: [0, 1, 9], lines: lines.map(({ text, start, end }) => ({ text, start, end })), total, taps });
  if (process.env.STILLS) {
    const ts = lines.flatMap((l, i) => [l.start + (l.end - l.start) * 0.3, l.start + (l.end - l.start) * 0.8, i < lines.length - 1 ? (l.end + lines[i + 1].start) / 2 : total - 1]);
    for (const [k, t] of ts.entries()) { await page.evaluate((x) => window.render(x), t); await page.screenshot({ path: `${process.env.STILLS}/f${String(k).padStart(2, '0')}.png` }); }
    console.log('stills', ts.length);
  } else {
    const silent = `${TMP}/video.mp4`;
    // JPEG frames are much quicker to take than PNG; at this quality the difference can't be seen.
    const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-g', '60', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round(total * FPS);
    for (let f = 0; f < n; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
      if (f % 300 === 0) console.log(`frame ${f}/${n}`);
    }
    enc.stdin.end();
    await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
    ff(['-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', OUT]);
    // WhatsApp copy: same picture size, steady 30 fps, smaller file so it sends and plays smoothly.
    ff(['-i', OUT, '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-r', String(FPS), '-g', '60',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', OUT.replace(/\.mp4$/, '-whatsapp.mp4')]);
    console.log('done', OUT, total.toFixed(1) + 's');
  }
} finally { await browser.close(); server.kill(); }
