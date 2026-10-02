// Verth Helper's AI answers come from the Verth server (which holds the Google Gemini key).
// If the server has AI switched off, the helper quietly keeps using its built-in guide.
export function makeServerAI(api) {
  if (!api) return null;
  let off = false;
  return async (q, history) => {
    if (off) throw new Error('off');
    const messages = history.slice(-12).map((m) => ({ role: m.role === 'model' ? 'model' : 'user', text: String(m.text).slice(0, 1000) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', text: q.slice(0, 1000) });
    const r = await fetch(api.replace(/\/+$/, '') + '/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503 || r.status === 404 || r.status === 401) { off = true; throw new Error('off'); }
    if (r.status === 429) throw new Error('limit');
    if (!r.ok || !j.text) throw new Error('failed');
    return j.text;
  };
}
