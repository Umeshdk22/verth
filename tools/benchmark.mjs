// Runs Verth's scam check on a fixed test set and saves the results exactly as they come out.
// It is not a pass/fail test, on purpose: the numbers are published as they are, mistakes included.
//   node tools/benchmark.mjs test/benchmark/messages-2026-10.json > test/benchmark/results-2026-10.json
import { readFileSync } from 'node:fs';
import { check, detectKind } from '../src/scamcheck.js';

const set = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// The same choice the app makes for shared text: job-like messages get the job check.
const kindOf = (t) => (/\b(exam|interview|recruit|hiring|offer\s+letter|shortlisted|selected|job|placement|internship|hr\b)/i.test(t) && detectKind(t) === 'message' ? 'job' : detectKind(t));
const rows = set.messages.map((m) => {
  const r = check(kindOf(m.text), m.text);
  return { ...m, verdict: r.verdict, flags: r.flags.map((f) => f.title) };
});
const count = (label, verdict) => rows.filter((r) => r.label === label && r.verdict === verdict).length;
const scams = rows.filter((r) => r.label === 'scam').length, genuine = rows.length - scams;
const summary = {
  date: '2026-10-11', total: rows.length, scams, genuine,
  scam: { high: count('scam', 'danger'), caution: count('scam', 'caution'), clear: count('scam', 'clear') },
  real: { clear: count('genuine', 'clear'), caution: count('genuine', 'caution'), high: count('genuine', 'danger') },
  byType: Object.fromEntries([...new Set(rows.map((r) => `${r.label}|${r.type}`))].map((k) => {
    const [label, type] = k.split('|'), g = rows.filter((r) => r.label === label && r.type === type);
    return [k, { n: g.length, danger: g.filter((r) => r.verdict === 'danger').length, caution: g.filter((r) => r.verdict === 'caution').length, clear: g.filter((r) => r.verdict === 'clear').length }];
  })),
};
console.log(JSON.stringify({ about: set.about, summary, rows }, null, 1));
