import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";

const env = { GEMINI_API_KEY: "test-key", ALLOWED_ORIGINS: "https://me.github.io" };
const req = (body, origin = "https://me.github.io", path = "/api/ai") =>
  new Request("https://w.example" + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const okGemini = text => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

test("rejects unknown origin", async () => {
  const r = await worker.fetch(req({ prompt: "hi" }, "https://evil.example"), env);
  assert.equal(r.status, 403);
});
test("fails clearly when the secret is missing", async () => {
  const r = await worker.fetch(req({ prompt: "hi" }), { ALLOWED_ORIGINS: "*" });
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /GEMINI_API_KEY/);
});
test("validates prompt and images", async () => {
  assert.equal((await worker.fetch(req({}), env)).status, 400);
  const imgs = Array.from({ length: 7 }, () => ({ mime: "image/png", data: "AAAA" }));
  assert.equal((await worker.fetch(req({ prompt: "x", images: imgs }), env)).status, 400);
  assert.equal((await worker.fetch(req({ prompt: "x", images: [{ mime: "text/html", data: "AAAA" }] }), env)).status, 400);
});
test("returns text from Gemini and never leaks the key", async () => {
  globalThis.fetch = okGemini("answer");
  const r = await worker.fetch(req({ prompt: "hi", images: [{ mime: "image/jpeg", data: "AAAA" }], json: true }), env);
  const raw = await r.text();
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(raw).text, "answer");
  assert.ok(!raw.includes("test-key"));
});
test("maps upstream 429 and empty responses", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 429 });
  assert.equal((await worker.fetch(req({ prompt: "hi" }), env)).status, 429);
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 });
  assert.equal((await worker.fetch(req({ prompt: "hi" }), env)).status, 502);
});
test("health endpoint reports key status only", async () => {
  const r = await worker.fetch(new Request("https://w.example/api/health"), env);
  const j = await r.json();
  assert.equal(j.keyConfigured, true);
  assert.ok(!JSON.stringify(j).includes("test-key"));
});
