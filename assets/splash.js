// Refuse to be shown inside another website's frame (stops click-jacking tricks).
if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location.href; } catch (e) {} }
// "Welcome to Verth": a short animated greeting over the page while it loads (never delays it).
// Shown once per visit; a tap skips it. Returning people are welcomed back by name.
(function () {
  var d = document.documentElement, key = 'verth-splash';
  try { if (sessionStorage.getItem(key)) { d.classList.add('splash-seen'); return; } sessionStorage.setItem(key, '1'); } catch (e) { d.classList.add('splash-seen'); return; }
  var start = function () {
    var el = document.getElementById('splash');
    if (!el) return;
    var name = '';
    try { name = String((JSON.parse(localStorage.getItem('verth-me') || 'null') || JSON.parse(localStorage.getItem('verth-last') || 'null') || {}).name || '').trim().split(/\s+/)[0].slice(0, 20); } catch (e) {}
    if (name) {
      var h = el.querySelector('.sp-title'); if (h) { h.textContent = 'Welcome back, '; var b = document.createElement('span'); b.textContent = name; h.appendChild(b); }
      var s = el.querySelector('.sp-sub'); if (s) s.textContent = 'Good to see you again. Stay alert, stay safe.';
    }
    var done = function () { el.classList.add('sp-out'); setTimeout(function () { el.remove(); }, 450); };
    el.addEventListener('click', done);
    setTimeout(done, 3500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
