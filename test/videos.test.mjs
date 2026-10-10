// Video languages: English always, plus the country's own language with full subtitles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { langForCountry, langForBrowser } from '../src/country-lang.js';
import { VIDEO_LANGS } from '../src/video-i18n.js';

const SRC = JSON.parse(readFileSync(new URL('../video/i18n/source.json', import.meta.url)));
const TIMES = JSON.parse(readFileSync(new URL('../video/i18n/timings-en.json', import.meta.url)));

test('countries pick their own language for the second video language', () => {
  assert.equal(langForCountry('DE'), 'de'); assert.equal(langForCountry('IN'), 'hi'); assert.equal(langForCountry('BR'), 'pt');
  assert.equal(langForCountry('JP'), 'ja'); assert.equal(langForCountry('SA'), 'ar'); assert.equal(langForCountry('TW'), 'zh-TW');
  assert.equal(langForCountry('US'), ''); assert.equal(langForCountry('GB'), '');
  assert.equal(langForBrowser(['de-AT', 'en']), 'de'); assert.equal(langForBrowser(['zh-HK']), 'zh-TW'); assert.equal(langForBrowser(['en-US']), '');
});

test('every language has every video’s subtitles, line for line, with the right timings', () => {
  assert.ok(Object.keys(VIDEO_LANGS).length >= 40);
  for (const [code, info] of Object.entries(VIDEO_LANGS)) {
    assert.ok(info.name && Object.keys(info.titles).length === 8, code);
    for (const [vid, lines] of Object.entries(SRC.lines)) {
      const f = new URL(`../assets/videos/subs/help-${vid}.${code}.vtt`, import.meta.url);
      assert.ok(existsSync(f), `${code} ${vid}`);
      const vtt = readFileSync(f, 'utf8');
      assert.match(vtt, /^WEBVTT/);
      assert.equal((vtt.match(/ --> /g) || []).length, lines.length, `${code} ${vid}`);
      assert.equal(TIMES[vid].length, lines.length, vid);
    }
  }
});
