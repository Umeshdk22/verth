// Renders the Verth help videos: real app screens in a phone, captions, taps, voice-over and
// light music. Every frame is drawn from an exact time and encoded, so playback never stutters.
//   node video/render.mjs <frames dir> <voice dir> <out dir> [only]
// frames: phone screenshots from the app test (VSHOTS=dir); voice: per-line clips from voices.yml.
import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [FRAMES, VOICE, OUT, ONLY] = process.argv.slice(2);
const FPS = 30, INTRO = 2.6, GAP = 0.55, OUTRO = 3.4;
const scripts = JSON.parse(readFileSync('video/scripts.json', 'utf8'));
const taps = JSON.parse(readFileSync(FRAMES + '/frames.json', 'utf8'));
mkdirSync(OUT, { recursive: true });
const TMP = OUT + '/tmp'; mkdirSync(TMP, { recursive: true });

// Which app screens go with each line (a screen with a tap shows a finger tapping that spot).
const T = (name, tap = true, pan = 0) => ({ name, tap, pan });
const SCENES = {
  intro: [[T('home', false)], [T('chat-pay', false)], [T('scan-filled'), T('scan-result', false)], [T('verify-incoming')], [T('circle-people', false), T('chat-room', false)], [T('guard-full', false)], [T('signup', false, -60)]],
  scan: [[T('scan-top', false)], [T('scan-top')], [T('scan-filled')], [T('scan-result', false), T('scan-flags', false)], [T('scan-db', false)], [T('scan-db2', false)], [T('scan-result', false)]],
  verify: [[T('verify-top', false)], [T('verify-top')], [T('verify-form')], [T('verify-wait', false), T('verify-incoming')], [T('verify-denied', false)], [T('verify-code'), T('verify-code-ok', false)]],
  chat: [[T('chat-list', false)], [T('chat-list'), T('chat-room', false)], [T('chat-room')], [T('chat-pay')], [T('chat-receipt', false), T('chat-history', false)], [T('chat-limit', false)]],
  circle: [[T('circle-top', false)], [T('circle-invite')], [T('circle-approve')], [T('circle-company', false)], [T('circle-newdevice', false)], [T('circle-rotate')]],
  plan: [[T('plan-top', false)], [T('plan-500', false)], [T('plan-1000', false)], [T('plan-1500', false), T('plan-2000', false)], [T('plan-2000', false)]],
  log: [[T('log-top', false)], [T('log-list', false)], [T('log-list', false)], [T('log-top', false)], [T('plan-1500', false)]],
  guard: [[T('guard-top', false)], [T('home-guard', false)], [T('guard-item', false)], [T('guard-item'), T('guard-ticked', false)], [T('guard-again'), T('guard-full', false)], [T('guard-full', false)]],
};
const WORDS = {
  en: { step: 'Step', eyebrow: (id) => (id === 'intro' ? 'Welcome' : 'How to use Verth'), open: 'Check before you pay.', endTitle: 'Check before you pay.', endText: 'Verth: stop scams before they cost you.' },
  hi: { step: 'स्टेप', eyebrow: (id) => (id === 'intro' ? 'स्वागत है' : 'वर्थ कैसे इस्तेमाल करें'), open: 'पैसे भेजने से पहले जाँचिए।', endTitle: 'पैसे भेजने से पहले जाँचिए।', endText: 'वर्थ: धोखे को नुकसान से पहले रोकिए।' },
};
const INTRO_END = { en: ['7 days free. Start today.', 'Create your free account and keep your family and team safe.'], hi: ['7 दिन मुफ़्त। आज ही शुरू कीजिए।', 'मुफ़्त अकाउंट बनाइए और अपने परिवार और टीम को सुरक्षित रखिए।'] };

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// Serve the repo so the stage page can load fonts, the logo and the screens.
if (existsSync('video/_frames')) rmSync('video/_frames');
symlinkSync(FRAMES, 'video/_frames');
const server = spawn('python3', ['-m', 'http.server', '8799', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

try {
  for (const [id, v] of Object.entries(scripts)) {
    for (const [li, lang] of ['en', 'hi'].entries()) {
      const key = `${id}-${lang}`;
      if (ONLY && !ONLY.split(',').some((o) => o === id || o === key || o === lang)) continue;
      const clips = v.lines.map((_, n) => `${VOICE}/${key}-${n + 1}.wav`);
      if (clips.some((c) => !existsSync(c))) { console.log('skip (voice missing)', key); continue; }
      // 1. tidy the voice clips: trim silence at both ends, 48 kHz
      let cursor = INTRO;
      const lines = v.lines.map((pair, n) => {
        const out = `${TMP}/${key}-${n + 1}.wav`;
        ff(['-i', clips[n], '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,highpass=f=70,aresample=48000', '-ac', '1', out]);
        const d = dur(out), start = cursor; cursor += d + GAP;
        const frames = SCENES[id][n].map((s) => ({ src: `_frames/${s.name}.png`, pan: s.pan, tap: s.tap ? taps[s.name] : null }));
        return { text: pair[li], file: out, start, end: start + d, frames };
      });
      const total = cursor - GAP + OUTRO;
      // 2. sound: voice on top, music underneath that dips while someone speaks
      const voiceTrack = `${TMP}/${key}-voice.wav`, music = `${TMP}/${key}-music.wav`, mix = `${TMP}/${key}-mix.m4a`;
      ff([...lines.flatMap((l) => ['-i', l.file]), '-filter_complex', `${lines.map((l, i) => `[${i}]adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`).join(';')};${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}`, '-ar', '48000', '-ac', '1', voiceTrack]);
      execFileSync('python3', ['video/music.py', total.toFixed(2), music]);
      ff(['-i', voiceTrack, '-i', music, '-filter_complex',
        '[0]aformat=channel_layouts=stereo,asplit=2[v][key];[1]volume=0.20[m];[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=600[md];[v][md]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9',
        '-ar', '48000', '-c:a', 'aac', '-b:a', '96k', mix]);
      // 3. pictures
      const w = WORDS[lang];
      const plan = { lang, eyebrow: w.eyebrow(id), title: v.title[li], stepWord: w.step, open: w.open, endTitle: id === 'intro' ? INTRO_END[lang][0] : w.endTitle, endText: id === 'intro' ? INTRO_END[lang][1] : w.endText, intro: INTRO, outroLen: OUTRO, total, lines: lines.map(({ text, start, end, frames }) => ({ text, start, end, frames })) };
      const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
      await page.goto('http://127.0.0.1:8799/video/stage.html');
      await page.evaluate((p) => window.setup(p), plan);
      const silent = `${TMP}/${key}-video.mp4`, final = `${OUT}/help-${key}.mp4`, poster = `${OUT}/help-${key}.jpg`;
      const enc = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-vf', 'scale=1080:1080', '-g', '60', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
      const n = Math.ceil(total * FPS);
      for (let f = 0; f < n; f++) {
        await page.evaluate((t) => window.render(t), f / FPS);
        const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
        if (f === Math.round((lines[0].start + 1.2) * FPS)) writeFileSync(`${TMP}/${key}-poster.jpg`, buf);
      }
      enc.stdin.end();
      await new Promise((r, j) => enc.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
      await page.close();
      ff(['-i', silent, '-i', mix, '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', final]);
      // a smaller poster for the page
      ff(['-i', `${TMP}/${key}-poster.jpg`, '-vf', 'scale=720:720', '-q:v', '5', poster]);
      const lens = existsSync('video/lengths.json') ? JSON.parse(readFileSync('video/lengths.json', 'utf8')) : {};
      lens[key] = Math.round(total * 10) / 10;
      writeFileSync('video/lengths.json', JSON.stringify(lens, null, 1));
      writeFileSync('src/video-lengths.js', `// Written by video/render.mjs: seconds per video. Empty until videos are published.\nexport const VIDEO_LENGTHS = ${JSON.stringify(lens)};\n`);
      console.log(`${key}: ${total.toFixed(1)}s, ${(readFileSync(final).length / 1e6).toFixed(1)} MB`);
    }
  }
} finally { await browser.close(); server.kill(); rmSync('video/_frames'); }
