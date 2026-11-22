// Measures selections per character on the MacKenzie & Soukoreff (2003) phrase set,
// the standard benchmark in text-entry research. The set is downloaded, not bundled.
import { readFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { typeAll } from "../src/simulate.ts";
import { Learner } from "../src/learn.ts";
import { loadPhrases } from "./phrases.ts";

const phrases = await loadPhrases();
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

// Same phrase set again, but the board remembers what was already typed.
const learned = new Learner();
const firstPass = typeAll(lex, phrases, { learner: learned });
const secondPass = typeAll(lex, phrases, { learner: learned });
const cpm1 = 60 / (firstPass.perChar * secPerSel);
const cpm2 = 60 / (secondPass.perChar * secPerSel);
console.log(`| same, second pass with memory of the first | ${secondPass.perChar.toFixed(2)} | ${cpm2.toFixed(1)} | ${(cpm2 / 5).toFixed(1)} |`);

// A short personal vocabulary typed five times: first vs last repetition.
const care = ["i need water", "please call the nurse", "turn me over please", "call zbigniew now"];
const personal = new Learner();
const passes = [];
for (let i = 0; i < 5; i++) {
  passes.push(typeAll(lex, care, { learner: personal, seed: 10 + i * 20 }));
}
console.log(`\nPersonal set (${care.length} sentences) first pass ${passes[0].perChar.toFixed(2)} looks/char, fifth pass ${passes[4].perChar.toFixed(2)}`);

// One switch (a key or a long blink): zones are lit in turn, first half, second
// half, up. Time is counted in scan steps.
const scanMs = Number(process.env.SCAN_MS ?? 1000);
const wpm = (stepsPerChar: number) => (60 / ((stepsPerChar * scanMs) / 1000) / 5).toFixed(1);
// Baseline: the usual single-switch layout, a row-column grid with the most frequent
// characters nearest the top left. Reaching row r, column c costs r + c steps (1-based).
const freq = new Map<string, number>();
for (const p of phrases) for (const ch of p + " ") freq.set(ch, (freq.get(ch) ?? 0) + 1);
const byFreq = [...freq.keys()].sort((a, b) => freq.get(b)! - freq.get(a)!);
const cells: [number, number][] = [];
for (let r = 1; r <= 6; r++) for (let c = 1; c <= 6; c++) cells.push([r, c]);
cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
const gridCost = new Map(byFreq.map((ch, i) => [ch, cells[i][0] + cells[i][1]]));
let gridSteps = 0, gridChars = 0;
for (const p of phrases) {
  for (const ch of p) gridSteps += gridCost.get(ch)!;
  gridSteps += 2; // "speak" in the first cell after the space
  gridChars += p.length;
}
const scan = typeAll(lex, phrases);
const scan5 = typeAll(lex, phrases, { errorRate: 0.05 });
console.log(`\nSingle switch, ${scanMs} ms per scan step\n`);
console.log("| board | scan steps / char | words / min |");
console.log("|---|---|---|");
console.log(`| row-column grid, frequency ordered, no prediction | ${(gridSteps / gridChars).toFixed(2)} | ${wpm(gridSteps / gridChars)} |`);
console.log(`| lookspeak halves + 4 word predictions | ${scan.stepsPerChar.toFixed(2)} | ${wpm(scan.stepsPerChar)} |`);
console.log(`| same, 5% wrong picks | ${scan5.stepsPerChar.toFixed(2)} | ${wpm(scan5.stepsPerChar)} |`);
