// Measures selections per character on the MacKenzie & Soukoreff (2003) phrase set,
// the standard benchmark in text-entry research. The set is downloaded, not bundled.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { typeAll } from "../src/simulate.ts";

const URL_ = "https://www.yorku.ca/mack/phrases2.txt";
const cache = new URL("../node_modules/.cache/phrases2.txt", import.meta.url);
if (!existsSync(cache)) {
  mkdirSync(new URL(".", cache), { recursive: true });
  const r = await fetch(URL_);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  writeFileSync(cache, await r.text());
}
const phrases = readFileSync(cache, "utf8")
  .split("\n")
  .map((s) => s.trim().toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " "))
  .filter(Boolean);
const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));

const dwell = Number(process.env.DWELL_MS ?? 800);
const overhead = Number(process.env.RETURN_MS ?? 500); // look back to center and read the next screen
const secPerSel = (dwell + overhead) / 1000;

const rows: [string, Parameters<typeof typeAll>[2]][] = [
  ["alphabetical halves, no prediction", { layout: "uniform", predictions: 0 }],
  ["frequency-weighted halves, no prediction", { layout: "huffman", predictions: 0 }],
  ["frequency-weighted + 4 word predictions", { layout: "huffman", predictions: 4 }],
  ["same, 5% wrong looks", { layout: "huffman", predictions: 4, errorRate: 0.05 }],
  ["same, 10% wrong looks", { layout: "huffman", predictions: 4, errorRate: 0.1 }],
];

console.log(`${phrases.length} phrases, ${phrases.join(" ").length} characters, ${dwell} ms dwell + ${overhead} ms return per selection\n`);
console.log("| board | selections / char | chars / min | words / min |");
console.log("|---|---|---|---|");
for (const [name, o] of rows) {
  const t0 = performance.now();
  const r = typeAll(lex, phrases, o);
  const cpm = 60 / (r.perChar * secPerSel);
  console.log(`| ${name} | ${r.perChar.toFixed(2)} | ${cpm.toFixed(1)} | ${(cpm / 5).toFixed(1)} |`);
  if (process.env.VERBOSE) console.error(`${name}: ${(performance.now() - t0).toFixed(0)} ms`);
}
