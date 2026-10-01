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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
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
