// Reads the text and any QR code in a photo or screenshot, entirely on this device.
// Loaded only when someone checks a picture (it's large), and the picture never leaves the phone.
import { createWorker } from 'tesseract.js';
import jsQR from 'jsqr';

const BASE = new URL('./', import.meta.url).href; // assets/ocr/
let workerPromise = null;
let progressCb = () => {};

function getWorker() {
  workerPromise ||= createWorker('eng', 1, {
    workerPath: BASE + 'worker.min.js',
    corePath: BASE,
    langPath: BASE,
    gzip: true,
    workerBlobURL: false, // keeps the site's strict security policy (no blob: workers)
    logger: (m) => progressCb(m),
  }).catch((e) => { workerPromise = null; throw e; });
  return workerPromise;
}

async function toCanvas(file, maxSide) {
  const bmp = await createImageBitmap(file);
  let { width: w, height: h } = bmp;
  // Small screenshots read better a little larger; huge photos are slow, so scale them down.
  const scale = Math.min(maxSide / Math.max(w, h), Math.max(w, h) < 900 ? 2 : 1);
  w = Math.round(w * scale); h = Math.round(h * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return c;
}

function findQR(canvas) {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })?.data || null;
  } catch { return null; }
}

/**
 * @param {File|Blob} file  the picture
 * @param {(stage:string, pct:number)=>void} onProgress
 * @returns {Promise<{text:string, qr:string|null, confidence:number}>}
 */
export async function readImage(file, onProgress = () => {}) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('not-image');
  if (file.size > 15 * 1024 * 1024) throw new Error('too-big');
  onProgress('Opening your picture', 5);
  const qrCanvas = await toCanvas(file, 1400);
  const qr = findQR(qrCanvas);
  const canvas = await toCanvas(file, 2200);
  progressCb = (m) => {
    if (m.status === 'recognizing text') onProgress('Reading the words', 40 + Math.round(m.progress * 58));
    else if (/load|initializ/.test(m.status)) onProgress('Getting ready (first time only)', 10 + Math.round((m.progress || 0) * 28));
  };
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  onProgress('Done', 100);
  return { text: data.text || '', qr, confidence: data.confidence || 0 };
}
