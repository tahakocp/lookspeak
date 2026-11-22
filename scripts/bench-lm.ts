// Same simulated user as bench.ts, with the on-device language model weighting the
// halves (src/lm.ts). Runs the model on the CPU through onnxruntime-node; the browser
// runs the same weights through WebGPU or WebAssembly.
//
// The context weight (0.8) and skipping the model for a first word with no earlier
// sentence were picked on phrases 1-100 only; phrases 101-500 were
// not looked at while tuning, so they are reported on their own as well.
import { readFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { typeSentence } from "../src/simulate.ts";
import { Learner } from "../src/learn.ts";
import { WordModel } from "../src/lm.ts";
import { hasContext } from "../src/context.ts";
import { loadPhrases } from "./phrases.ts";

const phrases = await loadPhrases();
const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));
const secPerSel = (Number(process.env.DWELL_MS ?? 800) + Number(process.env.RETURN_MS ?? 500)) / 1000;

let t0 = performance.now();
const model = await WordModel.load(lex.words, lex.frequencies, "cpu", "q4");
console.log(`model loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// One model call per word boundary of each phrase, kept as float32 to bound memory.
// `history` is the previous phrase, standing in for what the user said just before.
async function predictAll(withHistory: boolean) {
  const out: Map<string, Float64Array>[] = [];
  let calls = 0;
  t0 = performance.now();
  for (let i = 0; i < phrases.length; i++) {
    const ws = phrases[i].split(" ");
    const history = withHistory && i > 0 ? [phrases[i - 1]] : [];
    const m = new Map<string, Float64Array>();
    for (let k = 0; k < ws.length; k++) {
      if (!hasContext(ws.slice(0, k), history)) continue;
      m.set(ws.slice(0, k).join(" "), await model.predict(ws.slice(0, k), history));
      calls++;
    }
    out.push(m);
  }
  return { out, msPerCall: (performance.now() - t0) / calls, calls };
}

type Opts = Parameters<typeof typeSentence>[2];
function run(range: [number, number], opts: (i: number) => Opts) {
  let chars = 0, sel = 0;
  for (let i = range[0]; i < range[1]; i++) {
    const r = typeSentence(lex, phrases[i], { seed: 1 + i, ...opts(i) });
    chars += r.chars;
    sel += r.selections;
  }
  return sel / chars;
}

const plain = await predictAll(false);
const hist = await predictAll(true);
const ctx = (w: Map<string, Float64Array>[]) => (i: number): Opts => ({ context: { get: (ws) => w[i].get(ws.join(" ")) ?? null } });
const all: [number, number] = [0, phrases.length];
const held: [number, number] = [100, phrases.length];
const row = (name: string, a: number, b: number) => {
  const wpm = (x: number) => (60 / (x * secPerSel) / 5).toFixed(1);
  console.log(`| ${name} | ${a.toFixed(2)} | ${b.toFixed(2)} | ${(100 * (1 - b / a)).toFixed(0)}% | ${wpm(a)} -> ${wpm(b)} |`);
};

console.log(`${phrases.length} phrases, ${plain.calls} model calls, ${plain.msPerCall.toFixed(1)} ms per call (${hist.calls} calls, ${hist.msPerCall.toFixed(1)} ms with the previous sentence)\n`);
console.log("| simulated user | looks/char, word list | looks/char, + language model | fewer looks | words/min |");
console.log("|---|---|---|---|---|");
row("all 500 phrases", run(all, () => ({})), run(all, ctx(plain.out)));
row("phrases 101-500 (not used for tuning)", run(held, () => ({})), run(held, ctx(plain.out)));
row("all 500, model also sees the previous sentence", run(all, () => ({})), run(all, ctx(hist.out)));
for (const e of [0.05, 0.1]) row(`all 500, ${e * 100}% wrong looks`, run(all, () => ({ errorRate: e })), run(all, (i) => ({ ...ctx(plain.out)(i), errorRate: e })));

// memory and the model together: second pass over the same phrases
const twice = (withModel: boolean) => {
  const l = new Learner();
  run(all, (i) => ({ learner: l, ...(withModel ? ctx(plain.out)(i) : {}) }));
  return run(all, (i) => ({ learner: l, ...(withModel ? ctx(plain.out)(i) : {}) }));
};
row("all 500, second pass with memory", twice(false), twice(true));
