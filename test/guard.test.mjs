import { test } from 'node:test';
import assert from 'node:assert/strict';
const mem = {}; globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const g = await import('../src/guard.js');
const realNow = Date.now; let now = Date.parse('2026-10-04T10:00:00+05:30'); Date.now = () => now;
const day = () => { now += 864e5; };
test('the check-up starts fresh each day, remembers yesterday, and counts a streak', () => {
  for (const x of g.GUARD) g.guardSet(x.id, true);
  assert.equal(g.guardScore(), 10); assert.equal(g.guardStreak(), 1);
  day(); assert.equal(g.guardScore(), 0); assert.equal(g.guardStreak(), 1);
  g.guardRepeat(); assert.equal(g.guardScore(), 10); assert.equal(g.guardStreak(), 2);
  day(); day(); assert.equal(g.guardStreak(), 0); // missed a day
  assert.match(g.viewGuard(), /Daily safety check-up/); assert.match(g.guardCard(), /Today’s check-up is ready/);
});
test.after(() => { Date.now = realNow; });
