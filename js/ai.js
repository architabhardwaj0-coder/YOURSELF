// Client for the secure AI backend (Cloudflare Worker). No API key ever lives in the browser.
export const aiEndpoint = () => (window.YOURSELF_CONFIG?.AI_ENDPOINT || "").trim();
export const aiAvailable = () => !!aiEndpoint();
export const aiBackendMessage = () =>
  `<div class="notice warn">The AI backend is not connected. Deploy the Worker in <b>worker/</b>, then set <b>AI_ENDPOINT</b> (see README → Deployment).</div>`;

export const dataUrlToInline = url => {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url || "");
  return m ? { mime: m[1], data: m[2] } : null;
};

export async function askAI(prompt, { images = [], json = false, signal } = {}) {
  const ep = aiEndpoint();
  if (!ep) throw new Error("AI_BACKEND_MISSING");
  let res;
  try {
    res = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, images, json }), signal });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new Error("Could not reach the AI backend. Check your connection and the AI_ENDPOINT setting.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `AI request failed (${res.status}).`);
  if (!data.text) throw new Error("The AI returned an empty response.");
  return data.text;
}

export function parseJSON(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const m = clean.match(/[\[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  throw new Error("The AI returned an unreadable response. Please try again.");
}

export const errorHTML = e => (e.message === "AI_BACKEND_MISSING" ? aiBackendMessage() : `<div class="notice error">${String(e.message).replace(/</g, "&lt;")}</div>`);
export const errorText = e => (e.message === "AI_BACKEND_MISSING" ? "AI backend is not connected yet (see README)." : e.message);
