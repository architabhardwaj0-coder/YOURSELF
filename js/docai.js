// AI features that work on an uploaded document: vision question extraction, answering, document chat.
import { askAI, parseJSON } from "./ai.js";
import { formatQuestion } from "./parser.js";

export const STYLES = {
  short: "Give a SHORT answer: the final answer plus at most two sentences of justification.",
  detailed: "Give a DETAILED answer with clear reasoning.",
  steps: "Give a STEP-BY-STEP solution, numbering each step, then state the final answer.",
  exam: "Write an EXAM-STYLE answer: precise, well structured, with the marks-worthy points a teacher expects.",
};
const LANG_NOTE = l => (l === "Hindi" ? "Write explanations in simple Hindi (Devanagari)." : l === "Hinglish" ? "Write explanations in natural Hinglish (Roman Hindi mixed with English)." : "Write explanations in simple English.");

/* ---- 1. Vision-based question extraction (page by page, keeps numbering) ---- */
export async function aiExtractQuestions(pages, { onProgress, signal } = {}) {
  const out = [];
  let lastNumber = "none";
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (!p.image) throw new Error("Page images are not available for this document. Upload the file again to use AI vision.");
    onProgress?.(`AI is reading page ${i + 1} of ${pages.length}…`);
    const prompt = `You are reading page ${i + 1} of ${pages.length} of an exam/question document. The attached image is the page. The OCR text below may contain errors; trust the image where they differ.
Extract EVERY question on this page, in order, without skipping or merging questions. Keep the original language (English or Hindi); do not translate. Keep mathematical expressions readable in plain text/LaTeX.
The previous page ended with question number: ${lastNumber}. If the first item here is the continuation of that question, set "continuesFromPrevious": true and put only the continued part in "text"/"options".
Return JSON only: {"questions":[{"number":"1","text":"","options":[{"label":"A","text":""}],"passage":"","needsVisual":false,"visualDescription":"","continuesFromPrevious":false,"confident":true,"issue":""}]}
Rules: attach options to the right question; put shared passages in "passage"; if a diagram/graph/table is required, set needsVisual=true and describe it in visualDescription; if any part is unreadable set confident=false and say what in "issue". If the page has no questions return {"questions":[]}.
OCR text:\n${p.text || "(none)"}`;
    const res = parseJSON(await askAI(prompt, { images: [{ mime: "image/jpeg", data: p.image.split(",")[1] }], json: true, signal }));
    for (const q of res.questions || []) {
      const item = {
        number: String(q.number ?? "").trim() || String(out.length + 1), text: String(q.text || "").trim(),
        options: (q.options || []).map(o => ({ label: String(o.label || "").trim(), text: String(o.text || "").trim() })),
        passage: String(q.passage || "").trim(), page: i + 1, pages: [i + 1],
        visual: { needed: !!q.needsVisual, description: String(q.visualDescription || "") },
        uncertain: q.confident === false, reason: String(q.issue || ""), source: "ai",
      };
      const prev = out[out.length - 1];
      if (q.continuesFromPrevious && prev) {
        prev.text = (prev.text + " " + item.text).trim();
        prev.options.push(...item.options);
        if (!prev.pages.includes(i + 1)) prev.pages.push(i + 1);
        prev.uncertain ||= item.uncertain; prev.reason = (prev.reason + " " + item.reason).trim();
      } else out.push(item);
    }
    if (out.length) lastNumber = out[out.length - 1].number;
  }
  out.forEach((q, idx) => (q.id = "q" + (idx + 1) + "_" + q.number));
  return out;
}

/* ---- 2. Answering ---- */
export async function answerQuestions(items, { style = "detailed", language = "English", imagesFor, onProgress, signal, batchSize = 5 } = {}) {
  const results = {};
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    onProgress?.(`Answering questions ${i + 1}–${Math.min(i + batchSize, items.length)} of ${items.length}…`);
    const listing = batch.map((q, k) => `[ref ${k + 1}] (printed number ${q.number}, page ${q.page})\n${formatQuestion(q)}${q.visual?.needed ? `\n(Depends on a visual: ${q.visual.description || "see attached page image"})` : ""}`).join("\n\n");
    const prompt = `You are an exam tutor inside a study app. Answer ONLY from the question content below (and the attached page images, if any). Never invent missing data. If a question is unreadable, incomplete, or depends on a visual you cannot see, set status "unreadable" and say exactly what is missing instead of guessing.
${STYLES[style] || STYLES.detailed} ${LANG_NOTE(language)}
For multiple-choice questions give "correctOption" as the option label and explain why it is correct. Format equations and code clearly.
Return JSON only: {"answers":[{"ref":1,"status":"ok","correctOption":"","answer":"","explanation":""}]} with one entry per ref, in order.

${listing}`;
    const imgs = (imagesFor?.(batch) || []).slice(0, 3);
    const res = parseJSON(await askAI(prompt, { images: imgs, json: true, signal }));
    const byRef = new Map((res.answers || []).map(a => [Number(a.ref), a]));
    batch.forEach((q, k) => {
      const a = byRef.get(k + 1);
      results[q.id] = a
        ? { status: a.status === "unreadable" ? "unreadable" : "ok", correctOption: String(a.correctOption || ""), answer: String(a.answer || ""), explanation: String(a.explanation || ""), style, language }
        : { status: "unreadable", correctOption: "", answer: "", explanation: "The AI returned no answer for this question. Try again.", style, language };
    });
  }
  return results;
}

/* ---- 3. Chat grounded in the document ---- */
export function buildContext(doc, message, pageIndex = null) {
  const total = doc.pages.reduce((n, p) => n + p.text.length, 0);
  let sel;
  if (pageIndex !== null) sel = [pageIndex];
  else if (total <= 30000) sel = doc.pages.map((_, i) => i);
  else {
    const words = (message.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
    const scored = doc.pages.map((p, i) => ({ i, s: words.reduce((n, w) => n + (p.text.toLowerCase().includes(w) ? 1 : 0), 0) }));
    sel = [...new Set([0, ...scored.sort((a, b) => b.s - a.s).slice(0, 4).map(x => x.i)])].sort((a, b) => a - b);
  }
  const text = sel.map(i => `--- Page ${i + 1} ---\n${doc.pages[i].text}`).join("\n");
  const outline = total > 30000 && doc.questions.length ? "\nQuestion outline:\n" + doc.questions.map(q => `Q${q.number} (p${q.page}): ${q.text.slice(0, 80)}`).join("\n") : "";
  return { text: text + outline, pageIdx: sel };
}

export async function askDocument(message, doc, { history = [], style = "detailed", language = "English", pageIndex = null, images = [], signal } = {}) {
  const ctx = buildContext(doc, message, pageIndex);
  const convo = history.slice(-6).map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n");
  const prompt = `You answer questions about ONE uploaded document, shown below as extracted text (it came from "${doc.name}" and may contain OCR mistakes; attached page images, if any, are authoritative).
Base your reply on the document. If the answer is not in it, say so plainly instead of guessing. Mention page or question numbers you rely on. ${STYLES[style] || ""} ${LANG_NOTE(language)}

DOCUMENT:
${ctx.text}

CONVERSATION SO FAR:
${convo || "(none)"}

USER: ${message}`;
  return { text: await askAI(prompt, { images: images.slice(0, 3), signal }), pageIdx: ctx.pageIdx };
}
