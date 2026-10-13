// Sharing a warning: helps the user's family spot the same scam, and is how new people find Verth.
// Only real findings are shared (not "No number found"), and never a clean result: "Verth says it's safe"
// passed around would mislead people. Personal details are hidden and links are made unclickable.
export const NOT_A_FINDING = /^(No number found|Nothing to check|This doesn’t look like a normal web address)$/;
export function shareable(r, flagged) {
  if (flagged >= 2) return true;
  return r.verdict !== 'clear' && r.flags.some((f) => !NOT_A_FINDING.test(f.title));
}
// "sbi-kyc.xyz" -> "sbi-kyc[.]xyz": still readable, but WhatsApp won't turn it into a link someone could tap.
export const defang = (s) => String(s || '').replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, (m) => (/^[a-z]{2,}$/i.test(m.split('.').pop()) ? m.replace(/\./g, '[.]') : m));
// A short piece of the message so family recognise it, with links, email addresses and any number of
// 4 or more digits (OTPs, account, card and phone numbers) hidden.
export function safeExcerpt(text, max = 160) {
  let t = String(text || '').replace(/\s+/g, ' ').trim()
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '[link]')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, (m) => (/\.(com|in|net|org|co|xyz|top|info|online|site|shop|club|live|app|link|ly|me|io|gov|bank|cc|ru|cn|tk|ml|ga|cf|gq|buzz|icu|vip|work|click|today|support|pro|biz|store|cloud|us|uk)\b/i.test(m) ? '[link]' : m))
    .replace(/\d(?:[\d\s-]*\d)?/g, (m, at, all) => (m.replace(/\D/g, '').length >= 4 && !/(₹|\brs\.?|\binr)\s*$/i.test(all.slice(Math.max(0, at - 5), at)) ? '••••' : m));
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t;
}
export function shareInfo(r, flagged) {
  const crowd = flagged >= 2, high = crowd || r.verdict === 'danger';
  const what = r.kind === 'link' ? 'link' : r.kind === 'phone' ? 'number' : r.kind === 'job' || r.sub === 'job' ? 'job offer' : 'message';
  // On a clean result the checker's notes are tips ("Ordinary mobile number"), not warning signs.
  const signs = r.verdict === 'clear' ? [] : [...r.flags].filter((f) => !NOT_A_FINDING.test(f.title)).sort((a, b) => b.level - a.level).map((f) => defang(f.title));
  if (crowd) signs.unshift(`Rated high risk in ${flagged} earlier Verth checks`);
  const bad = r.kind === 'link' ? [r.host || r.normalized].filter(Boolean) : (r.links || []).filter((l) => l.verdict !== 'clear').map((l) => l.host || l.normalized);
  const excerpt = r.kind === 'link' || r.kind === 'phone' ? '' : safeExcerpt(r.kind === 'image' ? r.text : r.input);
  return { high, what, signs: [...new Set(signs)].slice(0, 4), links: [...new Set(bad)].slice(0, 3).map(defang), number: r.kind === 'phone' ? r.normalized : '', excerpt };
}
export function shareText(r, flagged) {
  const s = shareInfo(r, flagged), L = [];
  L.push(s.high ? '🚨 *Scam alert*' : '⚠️ *Be careful*', '');
  L.push(s.number ? `This number looks ${s.high ? 'like a scam' : 'suspicious'}: *${s.number}*` : s.high ? `I got this ${s.what} and it looks like a scam:` : `I got this ${s.what} and it has warning signs:`);
  if (s.excerpt) L.push(`“${s.excerpt}”`);
  if (s.links.length && r.kind === 'link') L.push(`Link: ${s.links[0]}`);
  L.push('', '*Warning signs:*', ...s.signs.map((t) => `• ${t}`));
  const extra = s.links.filter((l) => !s.signs.some((t) => t.includes(l)));
  if (extra.length && r.kind !== 'link') L.push(`• Risky link: ${extra.join(', ')}`);
  L.push('', s.number ? 'If this number calls or messages you, don’t pay, share an OTP or install any app.' : 'If you get the same, don’t click any link, share an OTP or pay.');
  L.push('', 'Check any message free before you pay: https://verth.in');
  return L.join('\n');
}
