// Refuse to be shown inside another website's frame (stops click-jacking tricks).
if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location.href; } catch (e) {} }
// Home page: opt-in soundtrack. Music never starts by itself.
(function () {
  var btn = document.getElementById('sound'), label = document.getElementById('sound-label'), audio = document.getElementById('theme');
  var video = document.getElementById('demo-video');
  if (!btn || !audio) return;
  audio.volume = 0.35;
  function set(on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); label.textContent = on ? 'Music on' : 'Music off'; var t = on ? 'Pause background music' : 'Play background music'; btn.setAttribute('aria-label', t); btn.setAttribute('title', t); }
  btn.addEventListener('click', function () {
    if (audio.paused) { audio.play().then(function () { set(true); }).catch(function () { set(false); }); }
    else { audio.pause(); set(false); }
  });
  // The demo video has its own voice-over, so pause the soundtrack while it plays.
  if (video) video.addEventListener('play', function () { if (!audio.paused) { audio.pause(); set(false); } });
})();

// "Install Verth" sheet. Android Chrome: one tap (the browser's own install prompt). iPhone: the
// Share → Add to Home Screen steps. Inside Instagram / Facebook / YouTube's own browser, installing
// is impossible, so it offers "Open in Chrome" (Android) or explains "Open in Safari" (iPhone).
// It opens by itself once on phones (after a scroll or a few seconds), never again for 7 days after
// "Not now", and never inside the installed app. The "Install Verth" buttons on the page open it too.
(function () {
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\/|MicroMessenger|; wv\)/i.test(ua) || (isIOS && !/Safari\//.test(ua));
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var KEY = 'verth-install-later', WEEK = 7 * 864e5, deferred = null, sheet = null, lastFocus = null;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function snoozed() { var t = +store(KEY) || 0; return Date.now() - t < WEEK; }

  function mode() {
    if (inApp) return isIOS ? 'inapp-ios' : 'inapp-android';
    if (deferred) return 'prompt';
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'desktop';
  }
  var I = {
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  var CSS = '.vi-back{position:fixed;inset:0;z-index:1200;background:rgba(18,8,47,.55);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .25s}' +
    '.vi-back.on{opacity:1}' +
    '.vi-card{position:relative;width:100%;max-width:440px;background:#fff;color:#16132B;border-radius:26px 26px 0 0;padding:0 0 calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -20px 60px -20px rgba(42,19,122,.5);transform:translateY(40px);transition:transform .3s cubic-bezier(.2,.9,.3,1.2);font-family:"Inter","Hind",system-ui,sans-serif;max-height:92vh;overflow:auto}' +
    '.vi-back.on .vi-card{transform:none}' +
    '@media (min-width:640px){.vi-back{align-items:center}.vi-card{border-radius:26px;padding-bottom:20px}}' +
    '.vi-top{position:relative;overflow:hidden;color:#fff;padding:26px 22px 22px;border-radius:26px 26px 0 0;background:radial-gradient(420px 220px at 85% 0,rgba(139,92,246,.75),transparent 60%),linear-gradient(150deg,#12082F 0%,#2A137A 55%,#4B23C9 100%)}' +
    '.vi-top::after{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.12) 1.2px,transparent 1.3px);background-size:20px 20px;-webkit-mask-image:linear-gradient(90deg,transparent,#000);mask-image:linear-gradient(90deg,transparent,#000);pointer-events:none}' +
    '.vi-grab{display:block;width:44px;height:5px;border-radius:9px;background:rgba(255,255,255,.35);margin:-12px auto 16px}' +
    '@media (min-width:640px){.vi-grab{display:none}}' +
    '.vi-app{display:flex;align-items:center;gap:14px;position:relative;z-index:1}' +
    '.vi-app img{width:64px;height:64px;border-radius:18px;box-shadow:0 10px 24px -6px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.2);background:#fff;flex:none}' +
    '.vi-app b{display:block;font-size:21px;letter-spacing:-.02em;line-height:1.2}' +
    '.vi-app small{display:block;opacity:.8;font-size:14px;margin-top:2px}' +
    '.vi-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px;position:relative;z-index:1}' +
    '.vi-chips span{font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22)}' +
    '.vi-x{position:absolute;top:14px;right:14px;z-index:2;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer}' +
    '.vi-x svg{width:16px;height:16px}' +
    '.vi-body{padding:18px 22px 4px}' +
    '.vi-title{font-size:19px;font-weight:750;letter-spacing:-.02em;margin:0 0 4px;line-height:1.25}' +
    '.vi-hi{color:#5F5A78;font-size:14.5px;margin:0 0 14px}' +
    '.vi-list{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:10px}' +
    '.vi-list li{display:flex;gap:12px;align-items:center;font-size:15px;line-height:1.35}' +
    '.vi-list i,.vi-steps i{flex:none;width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:#F0EBFF;color:#5B2FDB}' +
    '.vi-list svg,.vi-steps svg{width:19px;height:19px}' +
    '.vi-steps{list-style:none;counter-reset:s;margin:0 0 16px;padding:0;display:grid;gap:10px}' +
    '.vi-steps li{display:flex;gap:12px;align-items:center;font-size:15px;line-height:1.35;background:#F7F5FF;border:1px solid #E7E1FA;border-radius:14px;padding:10px 12px}' +
    '.vi-steps li::before{counter-increment:s;content:counter(s);flex:none;width:24px;height:24px;border-radius:50%;background:#5B2FDB;color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center}' +
    '.vi-steps b{font-weight:700}' +
    '.vi-go{width:100%;min-height:54px;border:0;border-radius:16px;font:inherit;font-size:17px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,#6B3DF0,#4B23C9);box-shadow:0 14px 28px -10px rgba(75,35,201,.7);display:flex;align-items:center;justify-content:center;gap:10px}' +
    '.vi-go svg{width:20px;height:20px}' +
    '.vi-go:active{transform:scale(.98)}' +
    '.vi-alt{width:100%;min-height:46px;margin-top:8px;border:1px solid #E4DFF4;border-radius:14px;background:#fff;color:#16132B;font:inherit;font-weight:600;cursor:pointer}' +
    '.vi-later{display:block;margin:10px auto 0;border:0;background:none;color:#5F5A78;font:inherit;font-size:14.5px;padding:8px 14px;cursor:pointer}' +
    '.vi-note{font-size:13px;color:#5F5A78;text-align:center;margin:12px 0 0}' +
    '.vi-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1201;background:#16132B;color:#fff;padding:12px 18px;border-radius:14px;font-weight:600;box-shadow:0 12px 30px -8px rgba(0,0,0,.4);max-width:calc(100vw - 32px);text-align:center}' +
    '@media (prefers-reduced-motion:reduce){.vi-back,.vi-card{transition:none}}';

  function body(m) {
    var benefits = '<ul class="vi-list">' +
      '<li><i>' + I.bolt + '</i><span>Opens in one tap from your home screen, like any app</span></li>' +
      (isIOS ? '<li><i>' + I.share + '</i><span>Check any message, link, number or QR code in seconds</span></li>'
             : '<li><i>' + I.share + '</i><span>Share any message or screenshot <b>→ Verth</b> to check it</span></li>') +
      '<li><i>' + I.lock + '</i><span>Free and safe. No Play Store, almost no space</span></li></ul>';
    var later = '<button class="vi-later" type="button" data-vi="later">Not now</button>';
    if (m === 'prompt') return benefits + '<button class="vi-go" type="button" data-vi="install">' + I.plus + 'Install Verth</button>' + later;
    if (m === 'ios') return '<ol class="vi-steps">' +
      '<li><span>Tap <b>Share</b> ' + inline(I.share) + ' in Safari (on newer iPhones: tap <b>⋯</b> first, then <b>Share</b>)</span></li>' +
      '<li><span>Scroll down and tap <b>Add to Home Screen</b> ' + inline(I.plus) + '</span></li>' +
      '<li><span>Tap <b>Add</b>. Verth appears on your home screen 🎉</span></li></ol>' +
      '<button class="vi-go" type="button" data-vi="later">Got it</button>';
    if (m === 'android') return benefits + '<ol class="vi-steps">' +
      '<li><span>Tap the menu ' + inline(I.dots) + ' at the top right of Chrome</span></li>' +
      '<li><span>Tap <b>Install app</b> or <b>Add to Home screen</b></span></li></ol>' +
      '<button class="vi-go" type="button" data-vi="later">Got it</button>';
    if (m === 'inapp-android') return '<p class="vi-hi" style="margin-top:-6px">You’re inside another app’s browser, which can’t install apps. Open Verth in Chrome to install it.</p>' +
      '<button class="vi-go" type="button" data-vi="chrome">Open in Chrome</button>' +
      '<button class="vi-alt" type="button" data-vi="copy">Copy link</button>' + later;
    if (m === 'inapp-ios') return '<p class="vi-hi" style="margin-top:-6px">You’re inside another app’s browser, which can’t install apps.</p>' +
      '<ol class="vi-steps"><li><span>Tap <b>⋯</b> or the compass icon, then <b>Open in Safari</b></span></li><li><span>In Safari, tap <b>Share → Add to Home Screen</b></span></li></ol>' +
      '<button class="vi-go" type="button" data-vi="copy">Copy link</button>' + later;
    return benefits + '<p class="vi-hi">In Chrome or Edge, click the <b>install icon</b> at the right end of the address bar. On your phone, open <b>verth.in</b> and tap <b>Install</b>.</p>' +
      '<button class="vi-go" type="button" data-vi="later">Got it</button>';
  }
  function inline(svg) { return '<span style="display:inline-grid;vertical-align:-4px;width:20px;height:20px;color:#5B2FDB">' + svg + '</span>'; }

  function render() {
    if (!sheet) return;
    var m = mode();
    sheet.querySelector('.vi-body').innerHTML =
      '<h2 class="vi-title" id="vi-title">' + (m.indexOf('inapp') === 0 ? 'Open in your browser to install' : 'Put Verth on your phone') + '</h2>' +
      (m.indexOf('inapp') === 0 ? '' : '<p class="vi-hi" lang="hi">वर्थ को अपने फ़ोन पर लगाएँ: मुफ़्त, सिर्फ़ 5 सेकंड में।</p>') + body(m);
  }
  function open(auto) {
    if (sheet || standalone) return;
    if (!document.getElementById('vi-css')) { var s = document.createElement('style'); s.id = 'vi-css'; s.textContent = CSS; document.head.appendChild(s); }
    lastFocus = document.activeElement;
    sheet = document.createElement('div');
    sheet.className = 'vi-back';
    sheet.innerHTML = '<div class="vi-card" role="dialog" aria-modal="true" aria-labelledby="vi-title">' +
      '<div class="vi-top"><span class="vi-grab"></span><button class="vi-x" type="button" data-vi="later" aria-label="Close">' + I.x + '</button>' +
      '<div class="vi-app"><img src="assets/icon-192.png" alt="" width="64" height="64"><div><b>Verth</b><small>Check before you trust · verth.in</small></div></div>' +
      '<div class="vi-chips"><span>🆓 Free</span><span>⚡ 5 seconds</span><span>🇮🇳 Hindi &amp; English</span></div></div>' +
      '<div class="vi-body"></div></div>';
    document.body.appendChild(sheet);
    render();
    sheet.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { sheet && sheet.classList.add('on'); var b = sheet && sheet.querySelector('.vi-go'); if (b) b.focus({ preventScroll: true }); });
    if (auto) store(KEY, String(Date.now())); // shown once by itself: don't pop up again for a week
  }
  function close() {
    if (!sheet) return;
    var s = sheet; sheet = null; s.classList.remove('on');
    document.removeEventListener('keydown', onKey);
    setTimeout(function () { s.remove(); }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function toast(t) {
    var el = document.createElement('div'); el.className = 'vi-toast'; el.setAttribute('role', 'status'); el.textContent = t;
    if (!document.getElementById('vi-css')) { var s = document.createElement('style'); s.id = 'vi-css'; s.textContent = CSS; document.head.appendChild(s); }
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 3200);
  }
  function onKey(e) { if (e.key === 'Escape') { store(KEY, String(Date.now())); close(); } }
  function onClick(e) {
    if (e.target === sheet) { store(KEY, String(Date.now())); return close(); }
    var b = e.target.closest('[data-vi]'); if (!b) return;
    var a = b.dataset.vi;
    if (a === 'later') { store(KEY, String(Date.now())); close(); }
    else if (a === 'install' && deferred) {
      var d = deferred; deferred = null;
      d.prompt();
      d.userChoice.then(function (r) { close(); if (r && r.outcome === 'dismissed') store(KEY, String(Date.now())); }, close);
    } else if (a === 'chrome') {
      location.href = 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
    } else if (a === 'copy') {
      var url = 'https://verth.in/';
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Link copied ✓ Paste it in your browser'; }, function () { b.textContent = 'verth.in'; });
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', function () { deferred = null; close(); standalone = true; toast('Verth is on your home screen 🎉'); syncButtons(); });

  // Every "Install Verth" button on the page opens the sheet (visible whenever installing makes sense).
  function syncButtons() {
    document.querySelectorAll('#install-btn,[data-install]').forEach(function (b) { b.hidden = standalone; });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#install-btn,[data-install]');
    if (b) { e.preventDefault(); open(false); }
  });
  syncButtons();

  // Opens by itself once on phones: after the visitor scrolls a little, or after 12 seconds.
  if (!standalone && (isIOS || isAndroid) && !snoozed() && !/[?&]noinstall/.test(location.search)) {
    var fired = false, timer = setTimeout(go, 12000);
    function go() { if (fired) return; fired = true; clearTimeout(timer); window.removeEventListener('scroll', onScroll); if (!snoozed() && !document.querySelector('.vh.open, dialog[open]')) open(true); }
    function onScroll() { if (window.scrollY > 700) go(); }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if ('serviceWorker' in navigator) {
    // Switch to a newly published version straight away, right after opening the page.
    var hadOld = !!navigator.serviceWorker.controller, opened = Date.now(), switched = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadOld && !switched && Date.now() - opened < 20000) { switched = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();

// Demo videos. English is always there; the second button is the visitor's own language (from the
// browser): Hindi has its own voice-over, other languages show the Welcome video with subtitles.
(function () {
  var video = document.getElementById('demo-video'), note = document.getElementById('video-note');
  if (!video) return;
  var NAMES = {"el": "Ελληνικά", "zh-TW": "繁體中文", "ru": "Русский", "sv": "Svenska", "sw": "Kiswahili", "sk": "Slovenčina", "zh-CN": "简体中文", "it": "Italiano", "hr": "Hrvatski", "he": "עברית", "am": "አማርኛ", "fil": "Filipino", "cs": "Čeština", "id": "Bahasa Indonesia", "uk": "Українська", "ja": "日本語", "vi": "Tiếng Việt", "fr": "Français", "ne": "नेपाली", "ur": "اردو", "nb": "Norsk bokmål", "pt": "Português", "ro": "Română", "de": "Deutsch", "fi": "Suomi", "bn": "বাংলা", "th": "ไทย", "fa": "فارسی", "bg": "Български", "tr": "Türkçe", "es": "Español", "sr": "Српски", "nl": "Nederlands", "hu": "Magyar", "pl": "Polski", "ms": "Bahasa Melayu", "ar": "العربية", "ko": "한국어", "da": "Dansk", "si": "සිංහල", "hi": "हिन्दी"};
  function local() {
    var list = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').toLowerCase(), b = l.split('-')[0];
      if (/^zh-(tw|hk|mo|hant)/.test(l)) return 'zh-TW';
      if (b === 'zh') return 'zh-CN';
      if (b === 'tl') b = 'fil'; if (b === 'no' || b === 'nn') b = 'nb'; if (b === 'iw') b = 'he';
      if (NAMES[b]) return b;
    }
    return '';
  }
  var LOC = local(), second = document.querySelector('[data-vlang="hi"]');
  if (second) { if (LOC) { second.textContent = NAMES[LOC]; second.lang = LOC; second.dataset.vlang = 'local'; } else second.remove(); }
  var state = { topic: 'intro', lang: LOC ? 'local' : 'en' };
  var NOTE = {
    'intro-en': 'Welcome to Verth, in English · turn the sound on', 'intro-hi': 'वर्थ में आपका स्वागत है, हिन्दी में · आवाज़ चालू करें',
    'scam-en': 'Scam check, in English · turn the sound on', 'scam-hi': 'स्कैम चेक, हिन्दी में · आवाज़ चालू करें',
    'org-en': 'For organisations, in English · turn the sound on', 'org-hi': 'कंपनियों के लिए, हिन्दी में · आवाज़ चालू करें',
  };
  function show(play) {
    var want = state.lang === 'local' ? LOC : 'en';
    var fileLang = want === 'hi' ? 'hi' : 'en', subs = want !== 'en' && want !== 'hi' && state.topic === 'intro';
    var id = state.topic + '-' + fileLang;
    document.querySelectorAll('[data-vtopic]').forEach(function (b) { var on = b.dataset.vtopic === state.topic; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    document.querySelectorAll('[data-vlang]').forEach(function (b) { var on = b.dataset.vlang === state.lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    video.parentElement.classList.toggle('sq', state.topic === 'intro');
    var file = 'assets/videos/' + (state.topic === 'intro' ? 'help-' : 'verth-') + id;
    if (video.getAttribute('src') !== file + '.mp4' || video.dataset.subs !== String(subs && want)) {
      video.pause();
      while (video.firstChild && video.firstChild.tagName === 'TRACK') video.removeChild(video.firstChild);
      video.querySelectorAll('track').forEach(function (t) { t.remove(); });
      if (subs) {
        var t = document.createElement('track'); t.kind = 'subtitles'; t.srclang = want; t.label = NAMES[want]; t.default = true;
        t.src = 'assets/videos/subs/help-intro.' + want + '.vtt'; video.appendChild(t);
      }
      video.dataset.subs = String(subs && want);
      video.poster = file + '.jpg';
      video.src = file + '.mp4';
      video.load();
      if (subs) video.addEventListener('loadedmetadata', function () { for (var i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'showing'; }, { once: true });
    }
    if (note) {
      var n = NOTE[id];
      if (want !== 'en' && want !== 'hi') n = state.topic === 'intro' ? NOTE[id] + ' · ' + NAMES[want] + ' subtitles' : NOTE[id] + ' (subtitles in ' + NAMES[want] + ' on the Welcome video)';
      note.textContent = n; note.lang = fileLang;
    }
    if (play) video.play().catch(function () {});
  }
  document.querySelectorAll('[data-vtopic]').forEach(function (b) { b.addEventListener('click', function () { state.topic = b.dataset.vtopic; show(true); }); });
  document.querySelectorAll('[data-vlang]').forEach(function (b) { b.addEventListener('click', function () { state.lang = b.dataset.vlang; show(true); }); });
  document.querySelectorAll('a[data-video]').forEach(function (a) { a.addEventListener('click', function () { state.topic = a.dataset.video; show(false); }); });
  show(false);
})();

// Quick check box in the hero: hand the text to the app's Scam check.
(function () {
  var form = document.getElementById('quick'), input = document.getElementById('quick-text');
  if (!form || !input) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (t) { try { sessionStorage.setItem('verth-share', t.slice(0, 5000)); } catch (err) {} }
    location.href = 'app.html#scan';
  });
})();

// Rotating showcase: changes every few seconds, pauses on hover or focus, stops if the user prefers less motion.
(function () {
  var root = document.getElementById('show');
  if (!root) return;
  var slides = root.querySelectorAll('.slide'), tabs = root.querySelectorAll('[data-slide]');
  var DUR = 3500, i = 0, timer = null, paused = false;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.style.setProperty('--dur', DUR + 'ms');
  function go(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    tabs.forEach(function (t, k) {
      t.classList.toggle('on', k === i); t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      var bar = t.querySelector('i'); if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    schedule();
  }
  function schedule() { clearTimeout(timer); if (!still && !paused && !document.hidden) timer = setTimeout(function () { go(i + 1); }, DUR); }
  function pause(p) { paused = p; root.classList.toggle('paused', p); if (p) clearTimeout(timer); else go(i); }
  tabs.forEach(function (t) { t.addEventListener('click', function () { go(+t.dataset.slide); }); });
  root.addEventListener('mouseenter', function () { pause(true); });
  root.addEventListener('mouseleave', function () { pause(false); });
  root.addEventListener('focusin', function () { pause(true); });
  root.addEventListener('focusout', function () { pause(false); });
  document.addEventListener('visibilitychange', schedule);
  var x0 = null;
  root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); x0 = null; });
  go(0);
})();

// Feature tabs: Messages, Job offers, Photos & QR, Verify a person, Help.
(function () {
  var tabs = document.querySelectorAll('[data-ftab]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (b) { var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      document.querySelectorAll('[data-fpanel]').forEach(function (p) { p.classList.toggle('on', p.dataset.fpanel === t.dataset.ftab); });
    });
  });
})();

// Returning visitors who are still logged in see "Open my Verth" instead of Log in / Create account.
(function () {
  var me = null;
  try { me = JSON.parse(localStorage.getItem('verth-me') || 'null'); } catch (e) {}
  if (!me || !me.name) return;
  var out = document.getElementById('acct-out'), inn = document.getElementById('acct-in'), av = document.getElementById('me-av');
  if (!out || !inn) return;
  out.hidden = true; out.style.display = 'none'; inn.hidden = false;
  var first = String(me.name).trim().split(/\s+/)[0].slice(0, 16);
  var photo = '';
  try { photo = localStorage.getItem('verth-photo') || ''; } catch (e) {}
  if (av) {
    if (/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(photo) && photo.length <= 80000) { var img = document.createElement('img'); img.src = photo; img.alt = ''; av.textContent = ''; av.appendChild(img); }
    else av.textContent = first.charAt(0).toUpperCase() || 'V';
  }
  var fb = document.getElementById('me-first'); if (fb && first) fb.textContent = 'Open my Verth, ' + first;
  inn.title = 'Logged in as ' + me.name;
})();

// "Words to stay safe by": changes every few seconds; pauses on hover; still for reduced motion.
(function () {
  var box = document.getElementById('qband'), dots = document.querySelectorAll('#qband-dots button');
  if (!box) return;
  var items = box.querySelectorAll('.qb-item'), i = 0, paused = false;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function go(n) {
    i = (n + items.length) % items.length;
    items.forEach(function (el, k) { el.classList.toggle('on', k === i); el.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
  }
  dots.forEach(function (d) { d.addEventListener('click', function () { go(+d.dataset.q); }); });
  box.addEventListener('mouseenter', function () { paused = true; });
  box.addEventListener('mouseleave', function () { paused = false; });
  go(Math.floor(Date.now() / 86400000) % items.length);
  if (!still) setInterval(function () { if (!paused && !document.hidden) go(i + 1); }, 4500);
})();
