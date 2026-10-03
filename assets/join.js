// The invite page: shows who invited you and to which circle, from the link they sent.
// Everything is read from the link and shown as plain text (never as HTML).
(function () {
  var q = new URLSearchParams(location.search);
  var clean = function (s, n) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); };
  var code = String(q.get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJKMNP-Z2-9]{8}$/.test(code)) code = '';
  var by = clean(q.get('by'), 40), circle = clean(q.get('n'), 60), type = q.get('t') === 'org' ? 'org' : 'family';
  var set = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };
  if (by) {
    set('j-from', by + ' invited you');
    set('j-av', by.charAt(0).toUpperCase());
    set('s-by', by);
    document.title = by + ' invited you to Verth';
  }
  if (circle) {
    var h = document.getElementById('j-title');
    if (h) { h.textContent = 'Join '; var sp = document.createElement('span'); sp.textContent = circle; h.appendChild(sp); h.appendChild(document.createTextNode(' on Verth')); }
    set('t-circle', circle);
    set('final-p', 'Join ' + circle + ' on Verth and stay one step ahead of scammers.');
  }
  set('t-type', type === 'org' ? 'Organisation circle · check payment and bank-change requests' : 'Family circle · check money requests and emergency messages');
  var dom = String(q.get('d') || '').toLowerCase();
  if (type === 'org' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dom) && dom.length <= 100) {
    var lk = document.getElementById('t-lock');
    if (lk) {
      var b = document.createElement('b'); b.textContent = 'Work emails only';
      lk.appendChild(b); lk.appendChild(document.createTextNode('Create your account with your email ending in @' + dom + '.'));
      lk.hidden = false;
    }
  }
  if (code) set('t-code', code.slice(0, 4) + '-' + code.slice(4));
  else { var t = document.getElementById('ticket'); if (t) t.querySelector('.t-note').textContent = 'Ask the person who invited you for the 8-character code.'; }
  // Join: create an account (or open Verth if already logged in on this phone) with the code ready.
  var me = null;
  try { me = JSON.parse(localStorage.getItem('verth-me') || 'null'); } catch (e) {}
  var href = 'app.html?' + (me && me.name ? '' : 'mode=signup&') + (code ? 'invite=' + code : '');
  ['j-join', 'j-join2'].forEach(function (id) { var a = document.getElementById(id); if (a) { a.href = href.replace(/[?&]$/, ''); if (me && me.name) a.textContent = 'Open Verth and join'; } });
})();
