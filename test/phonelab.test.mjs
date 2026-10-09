// The phone check-up tools: what the browser can tell, and App X-ray on screenshot text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xrayText, parseDevice, judgeDevice, expectedChrome, expectedIos } from '../src/phonelab.js';

const NOW = Date.UTC(2026, 9, 9);
const st = (r, id) => r.find((x) => x.id === id)?.state;

test('App X-ray finds screen-sharing, SMS-forwarding, fake and loan apps, and ignores real ones', () => {
  const r = xrayText('Apps\nAll apps\nAnyDesk\n7.4 MB\nGoogle Opinion Rewards\nSBI Rewards Points\nWhatsApp\nPaytm\nInstant Loan Cash\nSMS Forwarder\nYouTube');
  assert.equal(r.verdict, 'danger');
  assert.deepEqual(r.items.map((i) => i.name), ['AnyDesk', 'SMS forwarding app', 'Fake rewards app', 'Instant loan app']);
  assert.equal(xrayText('Apps\nWhatsApp\nYouTube\nCalculator\nCamera\nGoogle Opinion Rewards\nPhonePe').verdict, 'clear');
  assert.equal(xrayText('Apps\nTeamViewer QuickSupport\nChrome').items[0].name, 'TeamViewer');
  assert.equal(xrayText('blurry').unreadable, true);
  assert.equal(xrayText('Accessibility\nInstalled apps\nTalkBack\nSelect to Speak').screen, 'accessibility');
});

test('device: version maths stays a little behind real releases', () => {
  assert.ok(expectedChrome(NOW) >= 150 && expectedChrome(NOW) <= 156);
  assert.equal(expectedIos(NOW), 27);
  assert.equal(expectedIos(Date.UTC(2026, 5, 1)), 26);
});

test('device: Android, iPhone and browser versions are judged fairly', () => {
  const ua = (v) => `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Mobile Safari/537.36`;
  const fresh = judgeDevice(parseDevice(ua(expectedChrome(NOW)), { platformVersion: '15.0.0' }), { lock: true, now: NOW });
  assert.equal(st(fresh, 'lock'), 'ok'); assert.equal(st(fresh, 'os'), 'ok'); assert.equal(st(fresh, 'browser'), 'ok');
  const old = judgeDevice(parseDevice(ua(expectedChrome(NOW) - 8), { platformVersion: '11.0.0' }), { lock: false, now: NOW });
  assert.equal(st(old, 'lock'), 'info'); assert.equal(st(old, 'os'), 'warn'); assert.equal(st(old, 'browser'), 'warn');
  // Without the real version (reduced user agent says "Android 10"), Verth says nothing about Android.
  assert.equal(st(judgeDevice(parseDevice(ua(150), {}), { now: NOW }), 'os'), undefined);
  const iphone = (v) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v}_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v}.1 Mobile/15E148 Safari/604.1`;
  assert.equal(st(judgeDevice(parseDevice(iphone(26)), { now: NOW }), 'os'), 'ok');
  assert.equal(st(judgeDevice(parseDevice(iphone(17)), { now: NOW }), 'os'), 'warn');
  assert.equal(st(judgeDevice(parseDevice(ua(150)), { installed: true, now: NOW }), 'app'), 'ok');
});
