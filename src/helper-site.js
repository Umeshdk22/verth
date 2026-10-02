// Verth Helper on the home page. Answers come from the built-in guide; buttons open the app.
import { mountHelper } from './helper.js';
import { makeServerAI } from './ai-client.js';
import { PAYMENTS, AI_HELPER } from './config.js';

const PLACES = { install: '#install', plan: '#plans', guide: '#how' };
mountHelper({
  ai: AI_HELPER.enabled ? makeServerAI(PAYMENTS.api) : null,
  go(to, text) {
    if (PLACES[to]) { location.hash = PLACES[to]; return; }
    if (to.startsWith('scan')) {
      // Hand the pasted text to the app in this tab only (same as Share to Verth).
      if (text) try { sessionStorage.setItem('verth-share', text.slice(0, 6000)); } catch {}
      location.href = 'app.html#' + (/^scan-(image|message|job|link|phone)$/.test(to) ? to : 'scan');
      return;
    }
    location.href = 'app.html';
  },
});
