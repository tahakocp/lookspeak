// Builds dist/: a static site that works offline after the first visit.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";
const cacheDir = "node_modules/.cache";
const model = join(cacheDir, "face_landmarker.task");

async function fetchModel() {
  if (!existsSync(model)) {
    mkdirSync(cacheDir, { recursive: true });
    const r = await fetch(MODEL_URL);
    if (!r.ok) throw new Error(`model download failed: ${r.status}`);
    writeFileSync(model, Buffer.from(await r.arrayBuffer()));
  }
  const sum = createHash("sha256").update(readFileSync(model)).digest("hex");
  if (sum !== MODEL_SHA256) throw new Error(`model checksum mismatch: ${sum}`);
}

await fetchModel();
rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist", { recursive: true });
cpSync("data/words.txt", "dist/words.txt");
for (const f of ["LICENSE", "THIRD_PARTY.md"]) cpSync(f, join("dist", f));
mkdirSync("dist/vendor/wasm", { recursive: true });
const wasmDir = "node_modules/@mediapipe/tasks-vision/wasm";
for (const f of readdirSync(wasmDir)) if (f.startsWith("vision_wasm_internal")) cpSync(join(wasmDir, f), join("dist/vendor/wasm", f));
cpSync(model, "dist/vendor/face_landmarker.task");

await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  outfile: "dist/app.js",
  legalComments: "linked",
});

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (!p.endsWith(".map")) files.push(p.slice("dist/".length));
  }
})("dist");
const hash = createHash("sha256");
for (const f of files.sort()) hash.update(f).update(readFileSync(join("dist", f)));
const version = hash.digest("hex").slice(0, 12);
const sw = readFileSync("src/sw.js", "utf8")
  .replace("__VERSION__", version)
  .replace("__FILES__", JSON.stringify(["./", ...files.filter((f) => f !== "index.html")]));
writeFileSync("dist/sw.js", sw);
const kb = files.reduce((s, f) => s + statSync(join("dist", f)).size, 0) / 1024;
console.log(`dist/ ${files.length} files, ${(kb / 1024).toFixed(1)} MB, cache ${version}`);
