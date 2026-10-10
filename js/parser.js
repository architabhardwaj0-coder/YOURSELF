// Splits extracted document text into questions and options.
// Pure functions only (no DOM) so they can be unit-tested in Node.

const PAGE_NOISE = /^(?:[-–—\s]*\d{1,3}[-–—\s]*|page\s*\d+(?:\s*(?:of|\/)\s*\d+)?)$/i;
const Q_RE = /^(?:(?:q(?:uestion|ue)?|प्रश्न)\s*\.?\s*)?(\d{1,3})\s*[.):](?:\s+(.*)|$)/i;
const INLINE_SPLIT = /\s+(?=\([A-Da-d1-4कखगघ]\)\s*\S)/;
const INLINE_MARK = /\([A-Da-d1-4कखगघ]\)/g;

export function normalizeText(t) {
  return String(t || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\t]+/g, " ")
    .replace(/\u200b/g, "")
    .replace(/ {2,}/g, " ")
    .split("\n").map(l => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const normLabel = l => (/[a-d]/.test(l) ? l.toUpperCase() : l);

function matchOption(line) {
  let m = line.match(/^\(([A-Da-d1-4कखगघ])\)\s*(.*)$/);
  if (m) return { label: normLabel(m[1]), text: m[2] };
  m = line.match(/^([A-Da-dकखगघ])[.)](?:\s+(.*)|$)/);
  if (m) return { label: normLabel(m[1]), text: m[2] || "" };
  return null;
}

function expand(line) {
  const marks = line.match(INLINE_MARK) || [];
  if (marks.length < 2) return [line];
  return line.split(INLINE_SPLIT).filter(Boolean);
}

function isNextNumber(n, last, hasCurrent) {
  if (!hasCurrent) return true;
  if (n === last + 1 || (n > last && n <= last + 2)) return true;
  if (n === 1 && last >= 2) return true; // new section restarts numbering
  return false;
}

function garbledRatio(s) {
  if (!s) return 0;
  const bad = (s.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length;
  return bad / s.length;
}

function finalize(q, idx) {
  q.text = q.text.trim();
  q.options.forEach(o => (o.text = o.text.trim()));
  const reasons = [];
  if (!q.text && !q.options.length) reasons.push("Question text is empty.");
  else if (q.text.length < 6 && !q.options.length) reasons.push("Question text is very short.");
  if (q.options.length === 1) reasons.push("Only one answer option was detected.");
  if (q.options.some(o => !o.text)) reasons.push("An answer option has no text.");
  const all = q.text + q.options.map(o => o.text).join("");
  if (garbledRatio(all) > 0.05) reasons.push("Some characters could not be read.");
  q.id = "q" + (idx + 1) + "_" + q.number;
  q.uncertain = reasons.length > 0;
  q.reason = reasons.join(" ");
  q.source = "text";
  return q;
}

/**
 * @param {{page:number,text:string}[]} pages
 * @returns {{questions:object[], preamble:string}}
 */
export function parseDocument(pages) {
  const rows = [];
  for (const p of pages || []) {
    for (const raw of normalizeText(p.text).split("\n")) {
      if (!raw || PAGE_NOISE.test(raw)) continue;
      for (const piece of expand(raw)) rows.push({ page: p.page, text: piece });
    }
  }
  const preamble = [];
  const questions = [];
  let cur = null, target = null, lastNum = 0;

  for (const { page, text } of rows) {
    const qm = text.match(Q_RE);
    if (qm) {
      const n = parseInt(qm[1], 10);
      if (isNextNumber(n, lastNum, !!cur)) {
        cur = { number: n, text: qm[2] || "", options: [], page, pages: [page] };
        questions.push(cur);
        lastNum = n;
        target = null;
        continue;
      }
    }
    if (!cur) { preamble.push(text); continue; }
    if (!cur.pages.includes(page)) cur.pages.push(page);
    const om = matchOption(text);
    if (om) {
      const o = { label: om.label, text: om.text };
      cur.options.push(o);
      target = o;
      continue;
    }
    if (target) target.text += " " + text;
    else cur.text += (cur.text ? " " : "") + text;
  }
  return { questions: questions.map(finalize), preamble: preamble.join("\n") };
}

/** Plain-text rendering of one question, used in prompts and when saving to a set. */
export function formatQuestion(q) {
  const opts = (q.options || []).map(o => `(${o.label}) ${o.text}`).join("\n");
  return [q.passage ? `Passage/context: ${q.passage}` : "", q.text, opts].filter(Boolean).join("\n");
}
