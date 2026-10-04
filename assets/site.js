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

// "Install Verth" button (Android Chrome and desktop Chrome/Edge).
(function () {
  var btn = document.getElementById('install-btn'), deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (btn) btn.hidden = false; });
  if (btn) btn.addEventListener('click', function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; btn.hidden = true; }); });
  if ('serviceWorker' in navigator) {
    // Switch to a newly published version straight away, right after opening the page.
    var hadOld = !!navigator.serviceWorker.controller, opened = Date.now(), switched = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadOld && !switched && Date.now() - opened < 20000) { switched = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();

// Demo videos: Scam check or For organisations, in English or Hindi.
(function () {
  var video = document.getElementById('demo-video'), note = document.getElementById('video-note');
  if (!video) return;
  var state = { topic: 'scam', lang: /^hi/i.test(navigator.language || '') ? 'hi' : 'en' };
  var NOTE = {
    'scam-en': 'Scam check, in English · turn the sound on', 'scam-hi': 'स्कैम चेक, हिन्दी में · आवाज़ चालू करें',
    'org-en': 'For organisations, in English · turn the sound on', 'org-hi': 'कंपनियों के लिए, हिन्दी में · आवाज़ चालू करें',
  };
  function show(play) {
    var id = state.topic + '-' + state.lang;
    document.querySelectorAll('[data-vtopic]').forEach(function (b) { var on = b.dataset.vtopic === state.topic; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    document.querySelectorAll('[data-vlang]').forEach(function (b) { var on = b.dataset.vlang === state.lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (video.getAttribute('src') !== 'assets/videos/verth-' + id + '.mp4') {
      video.pause();
      video.poster = 'assets/videos/verth-' + id + '.jpg';
      video.src = 'assets/videos/verth-' + id + '.mp4';
      video.load();
    }
    if (note) { note.textContent = NOTE[id]; note.lang = state.lang; }
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
