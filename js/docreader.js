// Reads PDFs and images in the browser: text layer first, OCR for scanned pages.
export const LIMITS = { maxBytes: 20 * 1024 * 1024, maxPages: 40, minTextChars: 30, previewMax: 1400, ocrLongSide: 2200 };
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

export class DocError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

export function classifyFile(file) {
  const n = (file.name || "").toLowerCase();
  if (file.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/.test(n)) return "image";
  return null;
}
export function validateFile(file) {
  if (!file) return "No file selected.";
  if (!file.size) return "The file is empty (0 bytes).";
  if (file.size > LIMITS.maxBytes) return `File is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 20 MB.`;
  if (!classifyFile(file)) return "Unsupported file type. Upload a PDF, JPG, PNG or WEBP file.";
  return "";
}

function need(name, label) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (window[name]) return resolve(window[name]);
      if (Date.now() - t0 > 10000) return reject(new DocError(`The ${label} library failed to load (network or content blocker). Reload the page and try again.`, "library"));
      setTimeout(poll, 100);
    })();
  });
}

/* ---------- PDF text in reading order ---------- */
function linesFrom(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = []; let cur = null;
  for (const it of sorted) {
    if (cur && Math.abs(cur.y - it.y) <= 3) cur.items.push(it);
    else { cur = { y: it.y, items: [it] }; lines.push(cur); }
  }
  return lines.map(l => {
    l.items.sort((a, b) => a.x - b.x);
    let s = "", prevEnd = null;
    for (const it of l.items) {
      if (prevEnd !== null && !s.endsWith(" ") && !it.s.startsWith(" ") && it.x - prevEnd > 1) s += " ";
      s += it.s; prevEnd = it.x + it.w;
    }
    return s.trim();
  }).filter(Boolean).join("\n");
}
export function itemsToText(rawItems, width) {
  const its = rawItems.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
  if (!its.length) return "";
  const mid = width / 2;
  const crossing = its.filter(i => i.x < mid - 4 && i.x + i.w > mid + 4).length;
  const left = its.filter(i => i.x + i.w / 2 < mid), right = its.filter(i => i.x + i.w / 2 >= mid);
  const twoCol = crossing / its.length < 0.03 && left.length > its.length * 0.25 && right.length > its.length * 0.25;
  return twoCol ? linesFrom(left) + "\n" + linesFrom(right) : linesFrom(its);
}
const looksGarbled = t => { const s = t.replace(/\s/g, ""); return s.length > 0 && ((s.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length / s.length > 0.1); };

/* ---------- OCR ---------- */
let ocrWorker = null, ocrLang = "", logger = () => {};
async function getOcr(lang) {
  const T = await need("Tesseract", "OCR");
  if (ocrWorker && ocrLang === lang) return ocrWorker;
  if (ocrWorker) { await ocrWorker.terminate().catch(() => {}); ocrWorker = null; }
  try {
    ocrWorker = await T.createWorker(lang, 1, { logger: m => { if (m.status) logger(`OCR: ${m.status}${m.progress ? " " + Math.round(m.progress * 100) + "%" : ""}`); } });
    ocrLang = lang;
  } catch (e) {
    if (lang !== "eng") { logger("Hindi OCR data could not be loaded; using English only."); return getOcr("eng"); }
    throw new DocError("The OCR engine could not start (it downloads language data on first use). Check your connection and retry.", "ocr");
  }
  return ocrWorker;
}
export async function releaseOcr() { if (ocrWorker) { await ocrWorker.terminate().catch(() => {}); ocrWorker = null; ocrLang = ""; } }

function preprocess(src) {
  const scale = src.width < 1500 ? Math.min(2, 3000 / Math.max(src.width, src.height)) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const total = c.width * c.height; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}
async function ocrCanvas(canvas, lang) {
  const w = await getOcr(lang);
  const { data } = await w.recognize(preprocess(canvas), { rotateAuto: true });
  return { text: (data.text || "").trim(), confidence: Math.round(data.confidence || 0) };
}

function toJpeg(canvas, maxSide = LIMITS.previewMax) {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

/* ---------- readers ---------- */
async function readPdf(file, opts) {
  const pdfjs = await need("pdfjsLib", "PDF");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const buf = await file.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 5)) !== "%PDF-") throw new DocError("This file is not a valid PDF.", "corrupt");
  let doc;
  try { doc = await pdfjs.getDocument({ data: buf }).promise; }
  catch (e) {
    if (e?.name === "PasswordException") throw new DocError("This PDF is password-protected. Remove the password and upload it again.", "password");
    throw new DocError("This PDF is corrupted or could not be opened.", "corrupt");
  }
  const warnings = [], total = doc.numPages, n = Math.min(total, LIMITS.maxPages);
  if (total > n) warnings.push(`Only the first ${n} of ${total} pages were read.`);
  const pages = [];
  for (let i = 1; i <= n; i++) {
    if (opts.signal?.aborted) throw new DocError("Cancelled.", "cancel");
    opts.onStatus(`Reading page ${i} of ${n}…`);
    const page = await doc.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let text = itemsToText(tc.items, vp1.width), method = "text", confidence = 100;
    const scanned = text.replace(/\s/g, "").length < LIMITS.minTextChars || looksGarbled(text);
    const scale = Math.min(3, (scanned ? LIMITS.ocrLongSide : LIMITS.previewMax) / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, background: "#ffffff" }).promise;
    if (scanned) {
      opts.onStatus(`Page ${i} of ${n} has no usable text layer — running OCR…`);
      const r = await ocrCanvas(canvas, opts.ocrLang);
      text = r.text; method = "ocr"; confidence = r.confidence;
      if (!text) warnings.push(`Page ${i}: no text could be read.`);
      else if (confidence < 60) warnings.push(`Page ${i}: low OCR confidence (${confidence}%). Check the extracted text.`);
    }
    pages.push({ page: i, text, method, confidence, image: toJpeg(canvas) });
    page.cleanup();
  }
  return { kind: "pdf", pages, warnings };
}

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new DocError("This image is corrupted or could not be decoded.", "corrupt")); };
      img.src = url;
    });
  }
}
async function readImage(file, opts) {
  opts.onStatus("Loading image…");
  const bmp = await loadBitmap(file);
  const w = bmp.width, h = bmp.height, k = Math.min(1, 2600 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  opts.onStatus("Running OCR…");
  const r = await ocrCanvas(canvas, opts.ocrLang);
  const warnings = [];
  if (!r.text) warnings.push("No text could be read from this image. Try a clearer, well-lit photo or use AI vision.");
  else if (r.confidence < 60) warnings.push(`Low OCR confidence (${r.confidence}%). Check the extracted text or use AI vision.`);
  return { kind: "image", pages: [{ page: 1, text: r.text, method: "ocr", confidence: r.confidence, image: toJpeg(canvas) }], warnings };
}

/** @returns {Promise<{kind:string,pages:{page:number,text:string,method:string,confidence:number,image:string}[],warnings:string[]}>} */
export async function readFile(file, { onStatus = () => {}, ocrLang = "eng", signal } = {}) {
  const bad = validateFile(file);
  if (bad) throw new DocError(bad, "invalid");
  logger = onStatus;
  try {
    return classifyFile(file) === "pdf" ? await readPdf(file, { onStatus, ocrLang, signal }) : await readImage(file, { onStatus, ocrLang, signal });
  } catch (e) {
    if (e instanceof DocError) throw e;
    console.error(e);
    throw new DocError("The file could not be processed: " + (e?.message || "unknown error"), "unknown");
  }
}
