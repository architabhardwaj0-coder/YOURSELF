// Copies the static site into dist/ and writes config.js from the AI_ENDPOINT env var.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname, dist = join(root, "dist");
const endpoint = (process.env.AI_ENDPOINT || "").trim();
if (endpoint && !/^https:\/\/[^\s]+$/.test(endpoint)) { console.error("AI_ENDPOINT must be an https:// URL."); process.exit(1); }
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true });
for (const p of ["index.html", "css", "js"]) cpSync(join(root, p), join(dist, p), { recursive: true });
writeFileSync(join(dist, "config.js"), `window.YOURSELF_CONFIG = ${JSON.stringify({ AI_ENDPOINT: endpoint })};\n`);
writeFileSync(join(dist, ".nojekyll"), "");
console.log(`✓ built dist/ (AI_ENDPOINT ${endpoint ? "set" : "NOT set — AI features will show a setup message"})`);
