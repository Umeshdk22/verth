// Checks a page for things a person would notice: text that can't be read, pages wider than the
// screen, pictures that didn't load, cut-off text, missing fonts, and buttons with no label.
// Used by the page audit (test/audit-site.cjs) and the app test (AUDIT=dir).
async function auditPage(page) {
  return page.evaluate(async () => {
    const issues = [];
    const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
    const label = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    const text = (el) => (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    // 1. wider than the screen
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) {
      const wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > W + 1 && !e.closest('[class*="marquee"],[class*="ticker"],.rail,.vh-panel'))
        .filter((e) => !getComputedStyle(e).position.includes('fixed')).slice(0, 4).map(label);
      if (wide.length) issues.push({ kind: 'overflow', detail: `page is ${document.documentElement.scrollWidth}px wide on a ${W}px screen: ${wide.join(', ')}` });
    }
    // 2. pictures
    for (const im of document.images) if (im.complete && im.naturalWidth === 0 && im.getAttribute('src') && !im.loading?.includes('lazy')) issues.push({ kind: 'image', detail: im.getAttribute('src') });
    // 3. hard-to-read text
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => {
      let bg = { r: 255, g: 255, b: 255, a: 0 };
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient or picture: can't judge
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0.6) return c;
      }
      const c = parse(getComputedStyle(document.body).backgroundColor);
      return c && c.a > 0 ? c : bg;
    };
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el) || seen.size > 2000) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) continue;
      seen.add(el);
      const cs = getComputedStyle(el), fg = parse(cs.color), bg = bgOf(el);
      if (!fg || !bg) continue;
      const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const big = parseFloat(cs.fontSize) >= 18.5 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
      if (ratio < (big ? 2.6 : 3.2)) issues.push({ kind: 'contrast', detail: `${ratio.toFixed(2)}:1 "${text(el)}" (${label(el)}, ${cs.color} on rgb(${bg.r},${bg.g},${bg.b}))` });
    }
    // 4. cut-off text
    for (const el of document.querySelectorAll('h1,h2,h3,b,strong,button,a,label,p,span')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (!el.matches('.sr,.sr-only,.visually-hidden,.vh-sr') && (cs.overflow.includes('hidden') || cs.overflowX === 'hidden') && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !el.querySelector('img,svg,video'))
        issues.push({ kind: 'clipped', detail: `"${text(el)}" (${label(el)})` });
    }
    // 5. fonts
    await document.fonts.ready;
    const fams = new Set([...document.querySelectorAll('h1,h2,p,button')].filter(vis).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
    for (const f of fams) if (!['system-ui', 'sans-serif', 'serif', 'monospace', '-apple-system'].includes(f) && !document.fonts.check(`16px "${f}"`)) issues.push({ kind: 'font', detail: `${f} not loaded` });
    // 6. buttons and links nobody can understand
    for (const el of document.querySelectorAll('button,a[href]')) if (vis(el) && !el.closest('details:not([open])') && !text(el) && !el.getAttribute('title') && !el.querySelector('img[alt]:not([alt=""])')) issues.push({ kind: 'label', detail: label(el) + ' ' + (el.getAttribute('href') || '') });
    // 6b. icons that grew too big (an icon with no size set fills its box)
    for (const el of document.querySelectorAll('button svg, a svg, .btn svg, li svg, label svg')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width > 64 || r.height > 64) issues.push({ kind: 'big-icon', detail: `${Math.round(r.width)}×${Math.round(r.height)} icon in ${label(el.closest('button,a,li,label') || el)} "${text(el.closest('button,a,li,label') || el)}"` }); }
    // 6c. slideshows with nothing showing
    for (const box of document.querySelectorAll('[data-rot]')) { if (!vis(box)) continue; const on = [...box.children].filter((c) => getComputedStyle(c).visibility === 'visible'); if (!on.length) issues.push({ kind: 'empty-slide', detail: `${box.dataset.rot}: ${[...box.children].map((c) => c.className).join(' | ')}` }); }
    // 7. help button on top of something important
    const fab = document.querySelector('.vh-fab');
    if (fab && vis(fab)) {
      const a = fab.getBoundingClientRect();
      for (const el of document.querySelectorAll('header .me-btn, header button, .tabs button, .composer')) {
        if (!vis(el)) continue;
        const b = el.getBoundingClientRect();
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) issues.push({ kind: 'overlap', detail: `help button covers ${label(el)} "${text(el)}"` });
      }
    }
    return { fonts: [...fams], issues };
  });
}
module.exports = { auditPage };
