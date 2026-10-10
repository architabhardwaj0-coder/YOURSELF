// Zero-dependency static dev server: http://localhost:8080 (ES modules and the mic need http(s), not file://).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname, port = Number(process.env.PORT) || 8080;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, path === "/" || path === "." ? "index.html" : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end("Not found"); }
}).listen(port, () => console.log(`Yourself running at http://localhost:${port}`));
