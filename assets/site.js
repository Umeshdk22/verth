// Home page: opt-in soundtrack. Music never starts by itself.
(function () {
  var btn = document.getElementById('sound'), label = document.getElementById('sound-label'), audio = document.getElementById('theme');
  var video = document.getElementById('demo-video');
  if (!btn || !audio) return;
  audio.volume = 0.35;
  function set(on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); label.textContent = on ? 'Sound on' : 'Soundtrack'; btn.setAttribute('aria-label', on ? 'Pause soundtrack' : 'Play soundtrack'); }
  btn.addEventListener('click', function () {
    if (audio.paused) { audio.play().then(function () { set(true); }).catch(function () { set(false); }); }
    else { audio.pause(); set(false); }
  });
  // The demo video has its own voice-over, so pause the soundtrack while it plays.
  if (video) video.addEventListener('play', function () { if (!audio.paused) { audio.pause(); set(false); } });
})();
