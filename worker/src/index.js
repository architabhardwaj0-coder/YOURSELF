// Cloudflare Worker: secure proxy between the static site and Gemini.
// The Gemini key lives only in the Worker secret GEMINI_API_KEY.

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_PROMPT_CHARS = 120000;
const MAX_IMAGES = 6;
const MAX_IMAGE_B64 = 4 * 1024 * 1024; // per image, base64 chars
const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
const UPSTREAM_TIMEOUT_MS = 55000;

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export function buildCors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
  const any = allowed.includes("*");
  const ok = any || allowed.includes(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": any ? "*" : ok ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    },
  };
}

export function validate(body) {
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) return "Missing prompt.";
  if (body.prompt.length > MAX_PROMPT_CHARS) return "Prompt is too long.";
  const images = body.images ?? [];
  if (!Array.isArray(images) || images.length > MAX_IMAGES) return `At most ${MAX_IMAGES} images are allowed.`;
  for (const im of images) {
    if (!im || !IMAGE_MIME.includes(im.mime) || typeof im.data !== "string" || !im.data) return "Invalid image payload.";
    if (im.data.length > MAX_IMAGE_B64) return "An image is too large.";
  }
  return "";
}

export default {
  async fetch(request, env) {
    const cors = buildCors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors.headers });
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, keyConfigured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || "gemini-2.5-flash" }, 200, cors.headers);
    }
    if (url.pathname !== "/api/ai" || request.method !== "POST") return json({ error: "Not found." }, 404, cors.headers);
    if (!cors.ok) return json({ error: "Origin not allowed." }, 403, cors.headers);
    if (!env.GEMINI_API_KEY) return json({ error: "AI backend is missing its GEMINI_API_KEY secret." }, 500, cors.headers);

    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413, cors.headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be JSON." }, 400, cors.headers); }
    const problem = validate(body);
    if (problem) return json({ error: problem }, 400, cors.headers);

    const parts = [{ text: body.prompt }];
    for (const im of body.images || []) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
    const generationConfig = { temperature: 0.2, maxOutputTokens: 8192 };
    if (body.json) generationConfig.responseMimeType = "application/json";

    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
        signal: ctrl.signal,
      });
    } catch (e) {
      const timeout = e?.name === "AbortError";
      return json({ error: timeout ? "The AI took too long to respond. Try again with fewer pages." : "Could not reach the AI service." }, timeout ? 504 : 502, cors.headers);
    } finally { clearTimeout(timer); }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const status = res.status === 429 ? 429 : res.status >= 500 ? 502 : 400;
      const msg = res.status === 429 ? "AI rate limit reached. Wait a moment and try again." : data?.error?.message || "The AI service returned an error.";
      return json({ error: msg }, status, cors.headers);
    }
    const block = data?.promptFeedback?.blockReason;
    if (block) return json({ error: `The AI declined this content (${block}).` }, 422, cors.headers);
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!text) return json({ error: "The AI returned an empty response." }, 502, cors.headers);
    const truncated = data?.candidates?.[0]?.finishReason === "MAX_TOKENS";
    return json({ text, truncated }, 200, cors.headers);
  },
};
