// Verth Helper's AI answers come from the Verth server (which holds the Google Gemini key).
// If the server has AI switched off, the helper quietly keeps using its built-in guide.
export function makeServerAI(api) {
  if (!api) return null;
  // After a "switched off" answer, try the server again a minute later instead of giving up for good.
  let offUntil = 0;
  return async (q, history) => {
    if (Date.now() < offUntil) throw new Error('off');
    const messages = history.slice(-12).map((m) => ({ role: m.role === 'model' ? 'model' : 'user', text: String(m.text).slice(0, 1000) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', text: q.slice(0, 1000) });
    let r;
    try { r = await fetch(api.replace(/\/+$/, '') + '/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) }); }
    catch { throw new Error('network'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 503 || r.status === 404 || r.status === 401) { offUntil = Date.now() + 60000; throw new Error('off'); }
    if (r.status === 429) throw new Error('limit');
    if (!r.ok || !j.text) throw new Error('failed');
    return j.text;
  };
}
