// Firestore bundles the "re2js" regex engine (≈145 KB) only for server-side Pipeline queries,
// which Verth never uses. This tiny stand-in keeps the app small; it uses the browser's RegExp.
export const RE2JS = {
  compile(pattern) {
    const any = new RegExp(pattern), whole = new RegExp('^(?:' + pattern + ')$');
    return { test: (s) => any.test(s), matches: (s) => whole.test(s) };
  },
};
