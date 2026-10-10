import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, normalizeText } from "../js/parser.js";

const P = (...texts) => texts.map((text, i) => ({ page: i + 1, text }));

test("numbered MCQs with options on separate lines", () => {
  const { questions } = parseDocument(P(
    "1. What is 2+2?\nA. 3\nB. 4\nC. 5\nD. 6\n2. Capital of France?\n(a) Paris\n(b) Rome\n(c) Oslo\n(d) Bern"));
  assert.equal(questions.length, 2);
  assert.equal(questions[0].options.length, 4);
  assert.equal(questions[0].options[1].text, "4");
  assert.equal(questions[1].options[0].label, "A");
  assert.equal(questions[1].text, "Capital of France?");
});

test("inline options on one line are split", () => {
  const { questions } = parseDocument(P("1) Value of x? (a) 5 (b) 6 (c) 7 (d) 8"));
  assert.equal(questions.length, 1);
  assert.equal(questions[0].options.length, 4);
  assert.equal(questions[0].text, "Value of x?");
});

test("question continuing across a page break stays together", () => {
  const { questions } = parseDocument(P(
    "1. A train travels from A to B at 60 km/h and\nreturns",
    "at 40 km/h. Average speed?\nA. 48\nB. 50\n2. Next question"));
  assert.equal(questions.length, 2);
  assert.match(questions[0].text, /returns at 40 km\/h/);
  assert.deepEqual(questions[0].pages, [1, 2]);
  assert.equal(questions[0].options.length, 2);
});

test("page numbers and headers are dropped, decimals are not questions", () => {
  const { questions } = parseDocument(P("1. Mass is 2.5 kg of sugar. Find cost.\n- 3 -\nPage 2 of 9\n2. Second"));
  assert.equal(questions.length, 2);
  assert.match(questions[0].text, /2\.5 kg/);
});

test("out-of-sequence number is treated as continuation, not a new question", () => {
  const { questions } = parseDocument(P("1. List the steps:\n7. seventh step mentioned\n2. Next"));
  assert.equal(questions.length, 2);
  assert.match(questions[0].text, /seventh step/);
});

test("Hindi labels and question prefix", () => {
  const { questions } = parseDocument(P("प्रश्न 1. भारत की राजधानी?\n(क) दिल्ली\n(ख) मुंबई"));
  assert.equal(questions.length, 1);
  assert.equal(questions[0].options[0].label, "क");
});

test("uncertain questions are flagged", () => {
  const { questions } = parseDocument(P("1. Pick one\nA. only option"));
  assert.equal(questions[0].uncertain, true);
  assert.match(questions[0].reason, /one answer option/);
});

test("empty or text without questions yields nothing", () => {
  assert.equal(parseDocument(P("")).questions.length, 0);
  const r = parseDocument(P("Just a paragraph about history."));
  assert.equal(r.questions.length, 0);
  assert.match(r.preamble, /history/);
});

test("normalizeText collapses whitespace", () => {
  assert.equal(normalizeText("a   b\r\n\r\n\r\n\r\nc"), "a b\n\nc");
});
