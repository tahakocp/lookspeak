import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTokenMap, contextText, softmaxLast, wordWeights, type ContextSource } from "../src/context.ts";
import { Lexicon } from "../src/lexicon.ts";
import { Typer } from "../src/typer.ts";
import { typeSentence } from "../src/simulate.ts";

// A toy tokenizer: each distinct leading chunk (up to 3 letters, with its space) is a token.
function fakeTokenizer() {
  const ids = new Map<string, number>();
  const first = (s: string) => {
    const m = /^ ?[A-Za-z']{1,3}/.exec(s)![0];
    if (!ids.has(m)) ids.set(m, ids.size);
    return ids.get(m)!;
  };
  return { ids, first };
}

test("words sharing a first token split its probability by corpus counts", () => {
  const words = ["cup", "cupboard", "tea"];
  const counts = [30, 10, 60];
  const tk = fakeTokenizer();
  const map = buildTokenMap(words, counts, 64, tk.first);
  const probs = new Float32Array(64);
  probs[tk.ids.get(" cup")!] = 0.8;
  probs[tk.ids.get(" tea")!] = 0.2;
  const w = wordWeights(map, probs, false);
  assert.ok(Math.abs(w[0] - 0.6) < 1e-6); // 0.8 * 30/40
  assert.ok(Math.abs(w[1] - 0.2) < 1e-6);
  assert.ok(Math.abs(w[2] - 0.2) < 1e-6);
});

test("sentence start uses tokens without a leading space and counts capitals", () => {
  const tk = fakeTokenizer();
  const map = buildTokenMap(["i", "it"], [5, 5], 64, tk.first);
  const probs = new Float32Array(64);
  probs[tk.ids.get("I")!] = 1; // "I" at the start of a line
  const w = wordWeights(map, probs, true);
  assert.equal(w[0], 1);
  assert.equal(w[1], 0);
});

test("no mass on any dictionary word gives all zeros", () => {
  const tk = fakeTokenizer();
  const map = buildTokenMap(["a"], [1], 64, tk.first);
  const w = wordWeights(map, new Float32Array(64), false);
  assert.equal(w[0], 0);
});

test("context text is cased like normal writing", () => {
  assert.equal(contextText(["i", "think", "i'm", "fine"]), "\nI think I'm fine");
  assert.equal(contextText([], ["thank you"]), "Thank you.\n");
});

test("softmax of the last row", () => {
  const p = softmaxLast([0, 0, 5, Math.log(3), 0, 0], 2, 3);
  assert.ok(Math.abs(p[0] - 0.6) < 1e-6 && Math.abs(p[1] - 0.2) < 1e-6);
});

const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));

function onlyAfter(prev: string, word: string): ContextSource {
  const w = new Float64Array(lex.words.length);
  w[lex.words.indexOf(word)] = 1;
  return { get: (ws) => (ws[ws.length - 1] === prev ? w : null) };
}

test("blend keeps word order and mixes the two distributions", () => {
  const w = new Float64Array(lex.words.length);
  const i = lex.words.indexOf("coffee");
  w[i] = 1;
  const b = lex.blend(w, 0.8);
  assert.deepEqual(b.top("", 1), ["coffee"]);
  assert.ok(b.count("coffee") > 0.8 && b.count("the") < 0.2);
  assert.deepEqual(lex.top("", 3), ["you", "i", "the"]);
});

test("the board offers the word the context model expects", () => {
  const t = new Typer(lex, { predictions: 4, layout: "huffman" }, null, onlyAfter("of", "coffee"));
  const plain = new Typer(lex);
  for (const typer of [t, plain]) for (const ch of "a cup of ") typer.apply({ id: ch === " " ? "space" : "c:" + ch, label: ch, weight: 1 });
  assert.ok(t.items().some((i) => i.id === "w:coffee"));
  assert.ok(!plain.items().some((i) => i.id === "w:coffee"));
});

test("a late answer does not move the halves under a look in progress", () => {
  let ready = false;
  const w = new Float64Array(lex.words.length);
  w[lex.words.indexOf("coffee")] = 1;
  const t = new Typer(lex, { predictions: 4, layout: "huffman" }, null, { get: () => (ready ? w : null) });
  const root = t.root;
  t.choose("left");
  ready = true;
  assert.equal(t.refresh(), false);
  assert.equal(t.root, root);
  t.choose("up");
  assert.equal(t.refresh(), true);
  assert.ok(t.items().some((i) => i.id === "w:coffee"));
});

test("a context model that knows the sentence saves looks", () => {
  const sentence = "i would like a cup of coffee";
  const plain = typeSentence(lex, sentence).selections;
  const smart = typeSentence(lex, sentence, { context: onlyAfter("of", "coffee") }).selections;
  assert.ok(smart < plain, `${smart} vs ${plain}`);
});

test("a first word with nothing before it is left to word frequencies", async () => {
  const { hasContext } = await import("../src/context.ts");
  assert.equal(hasContext([], []), false);
  assert.equal(hasContext([], ["thank you"]), true);
  assert.equal(hasContext(["i"], []), true);
});
