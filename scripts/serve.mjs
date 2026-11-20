// Minimal static server for dist/. Camera access needs localhost or https.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg", ".png": "image/png", ".task": "application/octet-stream", ".map": "application/json",
};

export function serve(root = "dist", port = 0) {
  const srv = http.createServer(async (req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(join(root, p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) => srv.listen(port, "127.0.0.1", () => ok(srv)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = await serve("dist", Number(process.env.PORT ?? 8080));
  console.log(`http://localhost:${srv.address().port}/`);
}
