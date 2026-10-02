// node --test reporter: prints failures as GitHub annotations (visible in the Actions summary).
export default async function* reporter(source) {
  let pass = 0, fail = 0;
  for await (const ev of source) {
    if (ev.type === 'test:pass' && ev.data.details?.type !== 'suite') pass++;
    if (ev.type === 'test:fail') {
      fail++;
      const msg = String(ev.data.details?.error?.cause?.message || ev.data.details?.error?.message || 'failed').replace(/\s+/g, ' ').slice(0, 300);
      yield `::error title=Rules test failed::${ev.data.name}: ${msg}\n`;
    }
  }
  yield `pass ${pass} fail ${fail}\n`;
}
