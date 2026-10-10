// Short "how to" videos for each part of Verth.
// English is always offered. The second language follows the person's country (or, before they
// sign up, their browser): Hindi has its own voice-over; every other language plays the English
// video with subtitles in that language.
// The card only loads a small picture; the video itself loads when someone taps play, and plays
// in its own window above the page, so live updates on the page never interrupt it.
import { VIDEO_LENGTHS } from './video-lengths.js';
import { VIDEO_LANGS } from './video-i18n.js';
import { langForCountry, langForBrowser } from './country-lang.js';

export const VIDEOS = {
  intro: ['Welcome to Verth', 'वर्थ में आपका स्वागत है'],
  scan: ['How to use Scan', 'स्कैन कैसे इस्तेमाल करें'],
  verify: ['How to use Verify', 'वेरिफ़ाई कैसे इस्तेमाल करें'],
  chat: ['How to use Chat', 'चैट कैसे इस्तेमाल करें'],
  circle: ['How to use your Circle', 'सर्कल कैसे इस्तेमाल करें'],
  plan: ['Plans and your free trial', 'प्लान और फ़्री ट्रायल'],
  log: ['The Verification log', 'वेरिफ़िकेशन लॉग'],
  guard: ['Daily safety check-up', 'रोज़ का सेफ़्टी चेक-अप'],
};
const HI = { name: 'हिन्दी', ui: { watch: 'वीडियो देखें', play: 'वीडियो चलाएँ', close: 'बंद करें', subtitles: 'सबटाइटल' } };
const KEY = 'verth-vlang';
const RTL = new Set(['ar', 'fa', 'ur', 'he']);
let country = '';
// The app tells the player the person's country once their profile is known.
export function setVideoCountry(iso) {
  if (iso === country) return;
  country = iso || '';
  if (typeof document !== 'undefined' && document.querySelector('.hv[data-hv]')) refreshCards();
}
// The second language, e.g. 'de' for Germany, 'hi' for India, '' when there's only English.
export const localLang = () => (country ? langForCountry(country) : langForBrowser());
const info = (l) => (l === 'hi' ? HI : VIDEO_LANGS[l] || null);
// What the person picked: 'en' or 'local'. New people start in their own language.
function choice() {
  try { const v = localStorage.getItem(KEY); if (v === 'en') return 'en'; if (v === 'local' || v === 'hi') return 'local'; } catch {}
  return 'local';
}
function setChoice(v) { try { localStorage.setItem(KEY, v); } catch {} }
// The language shown now: 'en', or the local language when there is one.
export function videoLang() { const l = localLang(); return choice() === 'local' && info(l) ? l : 'en'; }

const len = (id, l) => { const s = VIDEO_LENGTHS[`${id}-${l}`]; return s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : ''; };
export const hasVideo = (id) => !!VIDEO_LENGTHS[`${id}-en`] || !!VIDEO_LENGTHS[`${id}-hi`];
const voiced = (id, l) => !!VIDEO_LENGTHS[`${id}-${l}`];
// Which file plays: Hindi has its own voice; other languages use the English video with subtitles.
const fileLang = (id, l) => (l === 'hi' && voiced(id, 'hi') ? 'hi' : voiced(id, 'en') ? 'en' : 'hi');
const title = (id, l) => (l === 'en' ? VIDEOS[id][0] : l === 'hi' ? VIDEOS[id][1] : info(l)?.titles?.[id] || VIDEOS[id][0]);
const ui = (l, k) => (l === 'en' ? { watch: 'Watch the video', play: 'Play video', close: 'Close', subtitles: 'Subtitles' }[k] : info(l)?.ui?.[k] || '');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const attrs = (l) => (l === 'en' ? '' : ` lang="${l}"${RTL.has(l) ? ' dir="rtl"' : ''}`);
const langButtons = (cur) => {
  const loc = localLang(), li = info(loc);
  const btn = (key, l, label) => `<button type="button" data-hv-lang="${key}" class="${cur === l ? 'on' : ''}"${attrs(l)}>${esc(label)}</button>`;
  return btn('en', 'en', 'English') + (li ? btn('local', loc, li.name) : '');
};
const src = (base, id, l, ext) => `${base}assets/videos/help-${id}-${fileLang(id, l)}.${ext}`;
const subs = (base, id, l) => `${base}assets/videos/subs/help-${id}.${l}.vtt`;

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';

// The small card shown in each section.
export function videoCard(id, { base = '', big = false } = {}) {
  if (!hasVideo(id)) return '';
  const l = videoLang(), sub = l !== 'en' && fileLang(id, l) === 'en';
  return `<section class="hv${big ? ' big' : ''}" data-hv="${id}" data-base="${base}">
    <button type="button" class="hv-thumb" data-hv-play aria-label="${esc(ui(l, 'play') || 'Play video')}: ${esc(title(id, l))}">
      <img src="${src(base, id, l, 'jpg')}" alt="" loading="lazy" width="720" height="720"><span class="hv-btn">${PLAY}</span>${len(id, fileLang(id, l)) ? `<span class="hv-len">${len(id, fileLang(id, l))}</span>` : ''}</button>
    <div class="hv-txt"><span class="hv-eye"${attrs(l)}>▶ ${esc(ui(l, 'watch'))}${sub ? ` · ${esc(ui(l, 'subtitles'))}` : ''}</span><b${attrs(l)}>${esc(title(id, l))}</b>
      <span class="hv-lang" role="group" aria-label="Video language">${langButtons(l)}</span></div>
  </section>`;
}

function refreshCards() {
  document.querySelectorAll('.hv[data-hv]').forEach((c) => { c.outerHTML = videoCard(c.dataset.hv, { base: c.dataset.base, big: c.classList.contains('big') }); });
  const m = document.getElementById('hv-modal');
  if (m) open(m.dataset.id, m.dataset.base);
}

function open(id, base) {
  const keepTime = document.querySelector('#hv-modal video')?.currentTime || 0;
  const prevFile = document.querySelector('#hv-modal video')?.getAttribute('src');
  close();
  const l = videoLang(), file = src(base, id, l, 'mp4'), sub = l !== 'en' && fileLang(id, l) === 'en';
  const m = document.createElement('div');
  m.id = 'hv-modal'; m.className = 'hv-modal'; m.dataset.id = id; m.dataset.base = base;
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', title(id, l));
  // English captions are always there for anyone who can't hear the voice; the local language's
  // subtitles are switched on by default.
  m.innerHTML = `<div class="hv-box">
      <div class="hv-head"><b${attrs(l)}>${esc(title(id, l))}</b>
        <span class="hv-lang">${langButtons(l)}</span>
        <button type="button" class="hv-x" data-hv-close aria-label="${esc(ui(l, 'close') || 'Close')}">✕</button></div>
      <video controls autoplay playsinline preload="auto" crossorigin="anonymous" poster="${src(base, id, l, 'jpg')}" src="${file}">
        ${fileLang(id, l) === 'en' ? `<track kind="captions" srclang="en" label="English" src="${subs(base, id, 'en')}">` : ''}
        ${sub ? `<track kind="subtitles" srclang="${l}" label="${esc(info(l).name)}" src="${subs(base, id, l)}" default>` : ''}
      </video>
    </div>`;
  document.body.appendChild(m);
  document.documentElement.classList.add('hv-open');
  const v = m.querySelector('video');
  // Switching between English and subtitles keeps the same video: carry on from the same moment.
  if (keepTime && prevFile === file) v.addEventListener('loadedmetadata', () => { try { v.currentTime = keepTime; } catch {} }, { once: true });
  if (sub) v.addEventListener('loadedmetadata', () => { for (const t of v.textTracks) t.mode = t.language === l ? 'showing' : 'disabled'; }, { once: true });
  v.play?.().catch(() => {});
  m.querySelector('.hv-x').focus({ preventScroll: true });
}
function close() {
  const m = document.getElementById('hv-modal');
  if (!m) return;
  m.querySelector('video')?.pause();
  m.remove();
  document.documentElement.classList.remove('hv-open');
}

let bound = false;
export function bindVideos() {
  if (bound) return; bound = true;
  document.addEventListener('click', (e) => {
    const lang = e.target.closest('[data-hv-lang]');
    if (lang) { e.preventDefault(); e.stopPropagation(); if (lang.dataset.hvLang !== choice()) { setChoice(lang.dataset.hvLang); refreshCards(); } return; }
    const play = e.target.closest('[data-hv-play]');
    if (play) { e.preventDefault(); e.stopPropagation(); const c = play.closest('.hv'); open(c.dataset.hv, c.dataset.base); return; }
    if (e.target.closest('[data-hv-close]') || e.target.id === 'hv-modal') { e.preventDefault(); close(); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
