// Documents page: upload -> read (text/OCR) -> detect questions -> answer -> chat -> history.
import { pages, afterRender, $, uid, esc, toast, render, expose, currentUser, saveCurrentUser, shell } from "./core.js";
import { readFile, validateFile } from "./docreader.js";
import { parseDocument, formatQuestion } from "./parser.js";
import { aiAvailable, aiBackendMessage, errorText } from "./ai.js";
import { aiExtractQuestions, answerQuestions, askDocument } from "./docai.js";

const ds = { current: null, images: {}, pageIndex: 0, selected: new Set(), busy: false, status: "", error: "", lastFile: null,
  ocrLang: "eng", style: "detailed", language: "English", chatBusy: false };

const setStatus = msg => { ds.status = msg; const el = $("docStatus"); if (el) el.textContent = msg; };
const MAX_DOCS = 30;

function persist(doc) {
  const u = currentUser(); if (!u) return;
  const i = u.documents.findIndex(d => d.id === doc.id);
  if (i >= 0) u.documents[i] = doc; else u.documents.unshift(doc);
  u.documents = u.documents.slice(0, MAX_DOCS);
  saveCurrentUser(u);
}
const imagesOf = doc => ds.images[doc.id] || [];
const newQuestions = pagesArr => parseDocument(pagesArr).questions;

/* ---------- processing ---------- */
async function processFile(file) {
  if (ds.busy) return toast("Please wait for the current file to finish.");
  ds.lastFile = file; ds.error = "";
  const bad = validateFile(file);
  if (bad) { ds.error = bad; return render(); }
  ds.busy = true; ds.current = null; ds.status = "Starting…"; render();
  try {
    const res = await readFile(file, { ocrLang: ds.ocrLang, onStatus: setStatus });
    const questions = newQuestions(res.pages);
    const doc = { id: uid("doc"), name: file.name, kind: res.kind, size: file.size, createdAt: new Date().toISOString(),
      pages: res.pages.map(({ image, ...p }) => p), questions, answers: {}, chat: [], warnings: res.warnings };
    ds.images[doc.id] = res.pages.map(p => p.image);
    ds.current = doc; ds.pageIndex = 0; ds.selected = new Set();
    persist(doc);
    ds.busy = false; render();
    const chars = doc.pages.reduce((n, p) => n + p.text.length, 0);
    if (!chars) toast("No text was read from this file. Try AI vision or a clearer file.");
    else if (!questions.length) toast("File read, but no numbered questions were detected.");
    else toast(`Read ${doc.pages.length} page(s) and found ${questions.length} question(s).`);
  } catch (e) {
    ds.busy = false; ds.error = e.message || "Processing failed."; render();
  }
}
async function docUpload(input) { const f = input.files?.[0]; input.value = ""; if (f) await processFile(f); }
function docRetry() { if (ds.lastFile) processFile(ds.lastFile); }

function docReparse() {
  const doc = ds.current; if (!doc) return;
  const ta = $("pageText");
  if (ta) doc.pages[ds.pageIndex].text = ta.value;
  const old = new Map(doc.questions.map(q => [q.text + "|" + q.number, q]));
  doc.questions = newQuestions(doc.pages).map(q => { const o = old.get(q.text + "|" + q.number); if (o) { q.id = o.id; } return q; });
  const keep = {}; doc.questions.forEach(q => { if (doc.answers[q.id]) keep[q.id] = doc.answers[q.id]; });
  doc.answers = keep; ds.selected = new Set();
  persist(doc); render(); toast(`Detected ${doc.questions.length} question(s).`);
}

async function docVision() {
  const doc = ds.current; if (!doc || ds.busy) return;
  if (!aiAvailable()) return toast(errorText(new Error("AI_BACKEND_MISSING")));
  const imgs = imagesOf(doc);
  if (!imgs.length) return toast("Page images are only kept for the current upload. Upload the file again to use AI vision.");
  ds.busy = true; ds.status = "AI is reading the pages…"; render();
  try {
    const qs = await aiExtractQuestions(doc.pages.map((p, i) => ({ ...p, image: imgs[i] })), { onProgress: setStatus });
    if (!qs.length) { ds.busy = false; render(); return toast("AI vision found no questions in this document."); }
    doc.questions = qs; doc.answers = {}; ds.selected = new Set();
    persist(doc); ds.busy = false; render(); toast(`AI vision found ${qs.length} question(s).`);
  } catch (e) { ds.busy = false; render(); toast(errorText(e)); }
}

/* ---------- answering ---------- */
const imagesFor = doc => batch => {
  const imgs = imagesOf(doc), want = new Set();
  batch.forEach(q => { const weak = q.visual?.needed || q.uncertain || doc.pages[q.page - 1]?.confidence < 70; if (weak) (q.pages || [q.page]).forEach(p => want.add(p - 1)); });
  return [...want].filter(i => imgs[i]).map(i => ({ mime: "image/jpeg", data: imgs[i].split(",")[1] }));
};
async function answerSome(list) {
  const doc = ds.current; if (!doc || ds.busy) return;
  if (!list.length) return toast("There are no questions to answer.");
  if (!aiAvailable()) return toast(errorText(new Error("AI_BACKEND_MISSING")));
  ds.style = $("docStyle")?.value || ds.style; ds.language = $("docLang")?.value || ds.language;
  ds.busy = true; ds.status = "Starting…"; render();
  try {
    const res = await answerQuestions(list, { style: ds.style, language: ds.language, imagesFor: imagesFor(doc), onProgress: setStatus });
    Object.assign(doc.answers, res); persist(doc); ds.busy = false; render();
    const bad = Object.values(res).filter(a => a.status !== "ok").length;
    toast(bad ? `Answered ${list.length - bad} question(s); ${bad} could not be answered reliably.` : `Answered ${list.length} question(s).`);
  } catch (e) { ds.busy = false; render(); toast(errorText(e)); }
}
const answerAll = () => answerSome(ds.current?.questions || []);
const answerSelected = () => answerSome((ds.current?.questions || []).filter(q => ds.selected.has(q.id)));
const answerOne = id => answerSome((ds.current?.questions || []).filter(q => q.id === id));
function toggleSel(id, on) { on ? ds.selected.add(id) : ds.selected.delete(id); }
function selectAll() { const d = ds.current; ds.selected = ds.selected.size === d.questions.length ? new Set() : new Set(d.questions.map(q => q.id)); render(); }
function setOpt(key, v) { ds[key] = v; }

/* ---------- chat ---------- */
async function sendChat(pageSummary = false) {
  const doc = ds.current; if (!doc || ds.chatBusy || ds.busy) return;
  const input = $("docChatInput");
  let msg = pageSummary ? `Summarize page ${ds.pageIndex + 1} of this document and explain it clearly.` : (input?.value || "").trim();
  if (!msg) return toast("Type a question first.");
  if (!aiAvailable()) return toast(errorText(new Error("AI_BACKEND_MISSING")));
  ds.style = $("docStyle")?.value || ds.style; ds.language = $("docLang")?.value || ds.language;
  if (!pageSummary) {
    if (/\b(answer|solve)\b.*\b(all|every)\b.*\bquestions?\b|\b(all|every)\b.*\bquestions?\b.*\b(answer|solve)\b/i.test(msg)) { if (input) input.value = ""; return answerAll(); }
    const m = msg.match(/\b(?:q|question|ques|प्रश्न)\.?\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/i);
    if (m && /\b(answer|solve|explain|solution)\b/i.test(msg)) {
      const q = doc.questions.find(x => String(x.number) === m[1]);
      if (!q) return toast(`Question ${m[1]} was not detected in this document.`);
      if (input) input.value = ""; return answerOne(q.id);
    }
  }
  doc.chat.push({ role: "user", text: msg }); ds.chatBusy = true; render();
  try {
    const idx = pageSummary ? ds.pageIndex : null;
    const imgs = imagesOf(doc);
    const weakPages = (idx !== null ? [idx] : doc.pages.map((_, i) => i)).filter(i => doc.pages[i].confidence < 70 && imgs[i]).slice(0, 3);
    const r = await askDocument(msg, doc, { history: doc.chat.slice(0, -1), style: ds.style, language: ds.language, pageIndex: idx, images: weakPages.map(i => ({ mime: "image/jpeg", data: imgs[i].split(",")[1] })) });
    doc.chat.push({ role: "ai", text: r.text });
  } catch (e) { doc.chat.push({ role: "ai", text: "⚠ " + errorText(e) }); }
  doc.chat = doc.chat.slice(-40); ds.chatBusy = false; persist(doc); render();
  const log = $("chatLog"); if (log) log.scrollTop = log.scrollHeight;
}

/* ---------- history / export ---------- */
function openDoc(id) {
  const d = currentUser().documents.find(x => x.id === id); if (!d) return;
  ds.current = d; ds.pageIndex = 0; ds.selected = new Set(); ds.error = ""; render(); window.scrollTo({ top: 0 });
}
function deleteDoc(id) {
  if (!confirm("Delete this document, its extracted text, answers and chat?")) return;
  const u = currentUser(); u.documents = u.documents.filter(d => d.id !== id); saveCurrentUser(u);
  delete ds.images[id]; if (ds.current?.id === id) ds.current = null; render(); toast("Document deleted.");
}
function deleteAllDocs() {
  if (!confirm("Delete ALL saved documents and their answers?")) return;
  const u = currentUser(); u.documents = []; saveCurrentUser(u); ds.images = {}; ds.current = null; render(); toast("All documents deleted.");
}
const answerLine = a => [a.correctOption && `Correct option: ${a.correctOption}`, a.answer, a.explanation].filter(Boolean).join("\n");
function saveToSet() {
  const doc = ds.current, u = currentUser(); if (!doc) return;
  const name = ($("docSetName")?.value || "").trim() || doc.name.replace(/\.[^.]+$/, "");
  const items = doc.questions.filter(q => doc.answers[q.id]?.status === "ok");
  if (!items.length) return toast("Answer some questions first, then save them to a set.");
  let set = u.sets.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (!set) { set = { id: uid("set"), name, questions: [] }; u.sets.push(set); }
  items.forEach(q => set.questions.push({ id: uid("q"), question: formatQuestion(q), answer: answerLine(doc.answers[q.id]), sourceText: "", attachment: { name: doc.name, type: doc.kind }, createdAt: new Date().toISOString() }));
  if (saveCurrentUser(u)) toast(`Saved ${items.length} question(s) to "${set.name}".`);
}
function docPage(d) { const n = ds.current.pages.length; ds.pageIndex = Math.max(0, Math.min(n - 1, ds.pageIndex + d)); render(); }

/* ---------- views ---------- */
const sel = (id, key, opts, onchange) => `<select id="${id}" class="select" style="width:auto" onchange="docOpt('${key}',this.value)">${opts.map(([v, l]) => `<option value="${v}" ${ds[key] === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;

function uploadCard() {
  return `<div class="card" style="padding:16px">
    <div class="attach-row">
      <label class="attach">🖼️<br>Gallery<input type="file" accept="image/jpeg,image/png,image/webp" onchange="docUpload(this)" ${ds.busy ? "disabled" : ""}></label>
      <label class="attach">📷<br>Camera<input type="file" accept="image/*" capture="environment" onchange="docUpload(this)" ${ds.busy ? "disabled" : ""}></label>
      <label class="attach">📄<br>PDF<input type="file" accept="application/pdf" onchange="docUpload(this)" ${ds.busy ? "disabled" : ""}></label>
    </div>
    <div class="row-wrap" style="margin-top:12px"><span class="small muted">Text language:</span>${sel("docOcr", "ocrLang", [["eng", "English"], ["eng+hin", "English + Hindi"]])}<span class="small muted">JPG, PNG, WEBP or PDF · up to 20 MB</span></div>
    ${ds.busy ? `<div id="docStatus" class="notice" style="margin-top:12px" role="status">${esc(ds.status)}</div>` : ""}
    ${ds.error ? `<div class="notice error" style="margin-top:12px"><b>Could not process the file.</b> ${esc(ds.error)}<div style="margin-top:8px">${ds.lastFile && !validateFile(ds.lastFile) ? `<button class="btn btn-light btn-small" onclick="docRetry()">Retry</button> ` : ""}<span class="small">You can also upload a clearer file.</span></div></div>` : ""}
  </div>`;
}

function questionCard(q, doc) {
  const a = doc.answers[q.id];
  return `<div class="dq ${q.uncertain ? "flag" : ""}">
    <div class="dq-head"><label class="row small"><input type="checkbox" ${ds.selected.has(q.id) ? "checked" : ""} onchange="docSel('${q.id}',this.checked)"> <b>Q${esc(q.number)}</b> <span class="muted">· page ${(q.pages || [q.page]).join("–")}</span> ${q.source === "ai" ? '<span class="chip">AI vision</span>' : ""}</label>
      <button class="btn btn-outline btn-small" ${ds.busy ? "disabled" : ""} onclick="docAnswerOne('${q.id}')">Answer</button></div>
    ${q.passage ? `<div class="small muted" style="margin-bottom:6px"><i>${esc(q.passage)}</i></div>` : ""}
    <div class="output">${esc(q.text) || '<span class="muted">(no text)</span>'}</div>
    ${q.options.length ? `<ul class="dq-opts">${q.options.map(o => `<li class="${a?.correctOption && a.correctOption.toUpperCase() === o.label.toUpperCase() ? "right" : ""}"><b>${esc(o.label)}</b> ${esc(o.text)}</li>`).join("")}</ul>` : ""}
    ${q.visual?.needed ? `<div class="small muted" style="margin-top:6px">📊 Uses a visual: ${esc(q.visual.description)}</div>` : ""}
    ${q.uncertain ? `<div class="notice warn" style="margin-top:8px">⚠ Could not be read with confidence. ${esc(q.reason)} Check page ${q.page} and fix the text, or try AI vision.</div>` : ""}
    ${a ? `<div class="dq-answer" ${a.status !== "ok" ? 'style="background:#fff8e8;border-color:#f0dcae"' : ""}>${a.status !== "ok" ? "⚠ Not answered reliably:\n" : ""}${esc(answerLine(a))}</div>` : ""}
  </div>`;
}

function workspace(doc) {
  const imgs = imagesOf(doc), p = doc.pages[ds.pageIndex], n = doc.pages.length, img = imgs[ds.pageIndex];
  const lowConf = p.method === "ocr" && p.confidence < 60;
  const answered = doc.questions.filter(q => doc.answers[q.id]?.status === "ok").length;
  return `<div class="card" style="padding:16px;margin-top:16px"><div class="stack">
    <div class="row-between"><div><b>${esc(doc.name)}</b><div class="small muted">${n} page(s) · ${doc.questions.length} question(s) detected</div></div><button class="btn btn-danger btn-small" onclick="docDelete('${doc.id}')">Delete</button></div>
    ${(doc.warnings || []).map(w => `<div class="notice warn">⚠ ${esc(w)}</div>`).join("")}
    <div class="doc-preview">${img ? `<img src="${img}" alt="Page ${p.page} preview">` : `<div class="muted small" style="padding:24px">Preview is only kept for the current upload. Upload the file again to see pages or use AI vision.</div>`}</div>
    <div class="row-between"><button class="btn btn-light btn-small" ${ds.pageIndex === 0 ? "disabled" : ""} onclick="docPage(-1)">← Prev</button>
      <div class="small">Page ${p.page} / ${n} <span class="chip ${lowConf ? "warn" : "ok"}">${p.method === "text" ? "text layer" : "OCR " + p.confidence + "%"}</span></div>
      <button class="btn btn-light btn-small" ${ds.pageIndex >= n - 1 ? "disabled" : ""} onclick="docPage(1)">Next →</button></div>
    ${!p.text.trim() ? `<div class="notice warn">No text was read on this page. Use AI vision, or upload a clearer file.</div>` : ""}
    <details ${lowConf ? "open" : ""}><summary><b>Extracted text (page ${p.page})</b> — review or correct</summary>
      <textarea id="pageText" class="textarea" style="margin-top:8px">${esc(p.text)}</textarea>
      <button class="btn btn-light btn-small" style="margin-top:8px" onclick="docReparse()">Save text &amp; re-detect questions</button></details>
    <div class="row-wrap"><button class="btn btn-outline btn-small" ${ds.busy ? "disabled" : ""} onclick="docVision()">✨ Detect questions with AI vision</button>
      <button class="btn btn-light btn-small" ${ds.busy || ds.chatBusy ? "disabled" : ""} onclick="docSummary()">Summarize this page</button></div>
  </div></div>

  <div class="card" style="padding:16px;margin-top:16px"><div class="stack">
    <div class="row-between"><h3 style="margin:0">Questions (${doc.questions.length})</h3>${doc.questions.length ? `<button class="btn btn-light btn-small" onclick="docSelectAll()">${ds.selected.size === doc.questions.length ? "Clear" : "Select all"}</button>` : ""}</div>
    ${doc.questions.length ? `
      <div class="row-wrap">${sel("docStyle", "style", [["short", "Short"], ["detailed", "Detailed"], ["steps", "Step-by-step"], ["exam", "Exam-style"]])}${sel("docLang", "language", [["English", "English"], ["Hindi", "Hindi"], ["Hinglish", "Hinglish"]])}</div>
      <div class="row-wrap"><button class="btn btn-primary" ${ds.busy ? "disabled" : ""} onclick="docAnswerAll()">Answer all</button>
        <button class="btn btn-outline" ${ds.busy || !ds.selected.size ? "disabled" : ""} onclick="docAnswerSelected()">Answer selected (${ds.selected.size})</button></div>
      ${doc.questions.map(q => questionCard(q, doc)).join("")}
      <hr style="margin:6px 0"><div class="row-wrap"><input id="docSetName" class="input" style="flex:1;min-width:160px" placeholder="Question Set name" value="${esc(doc.name.replace(/\.[^.]+$/, ""))}">
        <button class="btn btn-light" onclick="docSaveSet()">Save ${answered} answered to set</button></div>`
    : `<div class="empty">No questions were detected. ${doc.pages.some(x => x.text.trim()) ? "The text was read but has no numbered questions — edit the text above, or try AI vision." : "Try AI vision or upload a clearer file."}</div>`}
  </div></div>

  <div class="card" style="padding:16px;margin-top:16px"><div class="stack">
    <h3 style="margin:0">Ask about this document</h3>
    <div class="small muted">Try: “Answer all questions”, “Answer question 7”, “Explain page 2”. Answers use this document’s text, not generic knowledge.</div>
    <div id="chatLog" class="chat-log">${doc.chat.map(m => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join("") || ""}${ds.chatBusy ? '<div class="msg ai muted">Thinking…</div>' : ""}</div>
    <div class="chat-row" style="grid-template-columns:1fr 110px"><input id="docChatInput" class="input" placeholder="Ask a follow-up…" onkeydown="if(event.key==='Enter')docChat()"><button class="btn btn-primary" ${ds.chatBusy || ds.busy ? "disabled" : ""} onclick="docChat()">Send</button></div>
  </div></div>`;
}

function historyList(u) {
  if (!u.documents.length) return "";
  return `<div style="margin-top:22px"><div class="row-between"><h3 style="margin:0 0 10px">Previous documents</h3><button class="btn btn-danger btn-small" onclick="docDeleteAll()">Delete all</button></div>
    <div class="set-list">${u.documents.map(d => `<div class="set-item" style="cursor:default"><button style="border:0;background:none;color:inherit;font:inherit;text-align:left;flex:1;padding:0" onclick="docOpen('${d.id}')"><span>${esc(d.name)}</span><br><small>${d.pages.length} page(s) · ${d.questions.length} question(s) · ${Object.keys(d.answers).length} answered · ${new Date(d.createdAt).toLocaleDateString()}</small></button><button class="btn btn-danger btn-small" onclick="docDelete('${d.id}')" aria-label="Delete">🗑️</button></div>`).join("")}</div></div>`;
}

pages.docs = () => shell(`<div class="page-title">Documents</div>
  <p class="muted small" style="text-align:center;margin-top:-12px">Upload a PDF or a photo of questions. Yourself reads it, finds the questions and answers them from what is actually in the file.</p>
  ${!aiAvailable() ? `<div style="margin-bottom:12px">${aiBackendMessage()}</div>` : ""}
  ${uploadCard()}${ds.current ? workspace(ds.current) : ""}${historyList(currentUser())}`);

afterRender.push(() => { const log = $("chatLog"); if (log) log.scrollTop = log.scrollHeight; });
expose({ docUpload, docRetry, docReparse, docVision, docAnswerAll: answerAll, docAnswerSelected: answerSelected, docAnswerOne: answerOne,
  docSel: toggleSel, docSelectAll: selectAll, docOpt: setOpt, docChat: () => sendChat(false), docSummary: () => sendChat(true),
  docOpen: openDoc, docDelete: deleteDoc, docDeleteAll: deleteAllDocs, docSaveSet: saveToSet, docPage });
