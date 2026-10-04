// Short "how to" videos for each part of Verth, in English and Hindi.
// The card only loads a small picture; the video itself loads when someone taps play, and plays
// in its own window above the page, so live updates on the page never interrupt it.
import { VIDEO_LENGTHS } from './video-lengths.js';

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
const KEY = 'verth-vlang';
export function videoLang() {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'hi') return v; } catch {}
  return /^hi\b/i.test(navigator.language || '') ? 'hi' : 'en';
}
function setLang(l) { try { localStorage.setItem(KEY, l); } catch {} }
const len = (id, l) => { const s = VIDEO_LENGTHS[`${id}-${l}`]; return s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : ''; };
export const hasVideo = (id) => !!VIDEO_LENGTHS[`${id}-en`] || !!VIDEO_LENGTHS[`${id}-hi`];
const ready = (id, l) => !!VIDEO_LENGTHS[`${id}-${l}`];
// The chosen language, or the other one while a video is only ready in one language.
const langFor = (id, l = videoLang()) => (ready(id, l) ? l : l === 'hi' ? 'en' : 'hi');
const langButtons = (id, l) => ['en', 'hi'].map((x) => `<button type="button" data-hv-lang="${x}" class="${l === x ? 'on' : ''}"${ready(id, x) ? '' : ` disabled title="${x === 'hi' ? 'हिन्दी वीडियो जल्द आ रहा है' : 'Coming soon'}"`}>${x === 'en' ? 'English' : 'हिन्दी'}</button>`).join('');
const src = (base, id, l, ext) => `${base}assets/videos/help-${id}-${l}.${ext}`;

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';

// The small card shown in each section.
export function videoCard(id, { base = '', big = false } = {}) {
  if (!hasVideo(id)) return '';
  const l = langFor(id), i = l === 'hi' ? 1 : 0;
  return `<section class="hv${big ? ' big' : ''}" data-hv="${id}" data-base="${base}">
    <button type="button" class="hv-thumb" data-hv-play aria-label="Play video: ${VIDEOS[id][i]}">
      <img src="${src(base, id, l, 'jpg')}" alt="" loading="lazy" width="720" height="720"><span class="hv-btn">${PLAY}</span>${len(id, l) ? `<span class="hv-len">${len(id, l)}</span>` : ''}</button>
    <div class="hv-txt"><span class="hv-eye">${l === 'hi' ? '▶ वीडियो देखें' : '▶ Watch the video'}</span><b>${VIDEOS[id][i]}</b>
      <span class="hv-lang" role="group" aria-label="Video language">${langButtons(id, l)}</span></div>
  </section>`;
}

function refreshCards() {
  const l = videoLang();
  document.querySelectorAll('.hv[data-hv]').forEach((c) => { c.outerHTML = videoCard(c.dataset.hv, { base: c.dataset.base, big: c.classList.contains('big') }); });
  const m = document.getElementById('hv-modal');
  if (m) open(m.dataset.id, m.dataset.base, l);
}

function open(id, base, l) {
  close();
  l = langFor(id, l);
  const i = l === 'hi' ? 1 : 0;
  const m = document.createElement('div');
  m.id = 'hv-modal'; m.className = 'hv-modal'; m.dataset.id = id; m.dataset.base = base;
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', VIDEOS[id][i]);
  m.innerHTML = `<div class="hv-box">
      <div class="hv-head"><b>${VIDEOS[id][i]}</b>
        <span class="hv-lang">${langButtons(id, l)}</span>
        <button type="button" class="hv-x" data-hv-close aria-label="Close">✕</button></div>
      <video controls autoplay playsinline preload="auto" poster="${src(base, id, l, 'jpg')}" src="${src(base, id, l, 'mp4')}"></video>
    </div>`;
  document.body.appendChild(m);
  document.documentElement.classList.add('hv-open');
  const v = m.querySelector('video');
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
    if (lang) { e.preventDefault(); e.stopPropagation(); if (lang.dataset.hvLang !== videoLang()) { setLang(lang.dataset.hvLang); refreshCards(); } return; }
    const play = e.target.closest('[data-hv-play]');
    if (play) { e.preventDefault(); e.stopPropagation(); const c = play.closest('.hv'); open(c.dataset.hv, c.dataset.base, videoLang()); return; }
    if (e.target.closest('[data-hv-close]') || e.target.id === 'hv-modal') { e.preventDefault(); close(); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
