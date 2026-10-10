// Lightweight lint: syntax of every JS file, index.html asset references, and inline-handler wiring.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
let failed = false;
const fail = m => { console.error("✗ " + m); failed = true; };

const jsFiles = [...readdirSync(join(root, "js")).map(f => "js/" + f), "worker/src/index.js", "config.js", ...readdirSync(join(root, "scripts")).map(f => "scripts/" + f)].filter(f => f.endsWith(".js") || f.endsWith(".mjs"));
for (const f of jsFiles) { try { execFileSync(process.execPath, ["--check", join(root, f)], { stdio: "pipe" }); } catch (e) { fail(`Syntax error in ${f}\n${e.stderr}`); } }

const html = readFileSync(join(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="((?!https?:)[^"#]+)"/g)) if (!existsSync(join(root, m[1]))) fail(`index.html references missing file: ${m[1]}`);

// every onclick="fn(" / onchange="fn(" must be exposed on window
const src = jsFiles.filter(f => f.startsWith("js/")).map(f => readFileSync(join(root, f), "utf8")).join("\n");
const exposed = new Set();
for (const block of src.matchAll(/expose\(\{([\s\S]*?)\}\);/g)) for (const id of block[1].matchAll(/([A-Za-z_]\w*)\s*(?::|,|$)/g)) exposed.add(id[1]);
const used = new Set([...src.matchAll(/on(?:click|change|keydown)="(?:[^"]*?[;\s])?([A-Za-z_]\w*)\(/g)].map(m => m[1]));
const ignore = new Set(["if", "event", "return"]);
for (const fn of used) if (!exposed.has(fn) && !ignore.has(fn)) fail(`Inline handler "${fn}(...)" is used in HTML but never exposed on window`);

if (failed) process.exit(1);
console.log(`✓ lint ok (${jsFiles.length} JS files, ${used.size} inline handlers wired)`);
