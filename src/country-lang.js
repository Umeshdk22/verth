// The main language of each country, for the second video language (English is always offered).
// Only languages Verth has subtitles or a voice for are listed; other countries get English only.
const MAP = {
  hi: 'IN',
  de: 'DE AT CH LI LU',
  fr: 'FR BE MC CI SN CM ML NE BF TG BJ GN CD CG GA TD CF MG HT DJ KM BI RW',
  es: 'ES MX AR CO PE VE CL EC GT CU BO DO HN PY SV NI CR PA UY GQ',
  pt: 'BR PT AO MZ CV GW ST TL',
  it: 'IT SM VA',
  nl: 'NL SR',
  pl: 'PL',
  ro: 'RO MD',
  ru: 'RU BY KZ KG TJ',
  uk: 'UA',
  tr: 'TR CY',
  ar: 'SA AE EG IQ JO KW LB LY MA OM QA SY TN YE DZ BH SD PS MR SO',
  fa: 'IR AF',
  ur: 'PK',
  he: 'IL',
  el: 'GR',
  bn: 'BD',
  ne: 'NP',
  si: 'LK',
  'zh-CN': 'CN SG',
  'zh-TW': 'TW HK MO',
  ja: 'JP',
  ko: 'KR KP',
  th: 'TH',
  id: 'ID',
  ms: 'MY BN',
  vi: 'VN',
  fil: 'PH',
  sw: 'KE TZ UG',
  am: 'ET',
  hu: 'HU',
  cs: 'CZ',
  sk: 'SK',
  sv: 'SE',
  da: 'DK',
  nb: 'NO',
  fi: 'FI',
  bg: 'BG',
  sr: 'RS ME BA',
  hr: 'HR',
};
export const COUNTRY_LANG = Object.fromEntries(Object.entries(MAP).flatMap(([lang, list]) => list.split(' ').map((iso) => [iso, lang])));
export const langForCountry = (iso) => COUNTRY_LANG[String(iso || '').toUpperCase()] || '';
// Visitors who aren't signed in: use the browser's language when Verth has it.
export function langForBrowser(list = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []) {
  const have = new Set(Object.keys(MAP));
  for (const raw of list) {
    const l = String(raw || '').toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(l)) return 'zh-TW';
    if (l.startsWith('zh')) return 'zh-CN';
    const base = l.split('-')[0] === 'tl' ? 'fil' : l.split('-')[0] === 'no' || l.split('-')[0] === 'nn' ? 'nb' : l.split('-')[0] === 'iw' ? 'he' : l.split('-')[0];
    if (have.has(base)) return base;
  }
  return '';
}
