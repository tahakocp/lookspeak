import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { Typer } from "../src/typer.ts";
import { pathTo } from "../src/huffman.ts";
import { typeSentence, typeAll } from "../src/simulate.ts";

const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));

function select(t: Typer, id: string) {
  for (const c of pathTo(t.node, id)!) t.choose(c);
}

test("letters, words, delete, undo and speak", () => {
  const t = new Typer(lex);
  select(t, "c:h");
  select(t, "c:i");
  assert.equal(t.text, "hi");
  select(t, "space");
  assert.equal(t.text, "hi ");
  select(t, "delete");
  assert.equal(t.text, "hi");
  t.choose("up"); // at root: undo the delete
  assert.equal(t.text, "hi ");
  select(t, "c:w");
  const word = t.items().find((i) => i.id.startsWith("w:"))!;
  select(t, word.id);
  assert.equal(t.text, "hi " + word.label + " ");
  let spoken = "";
  for (const c of pathTo(t.node, "speak")!) {
    const ev = t.choose(c);
    if (ev.kind === "spoke") spoken = ev.text;
  }
  assert.equal(spoken, "hi " + word.label);
  assert.equal(t.text, "");
});

test("up inside the tree goes back one level without changing text", () => {
  const t = new Typer(lex);
  t.choose("left");
  assert.equal(t.depth, 1);
  t.choose("up");
  assert.equal(t.depth, 0);
  assert.equal(t.text, "");
});

test("simulated user types rare words and names", () => {
  const r = typeSentence(lex, "call dr zbigniew at noon");
  assert.ok(r.selections > 0);
});

test("prediction + huffman beats an alphabetical binary split by a wide margin", () => {
  const s = ["i need some water please", "can you turn me over", "my back hurts", "thank you for coming"];
  const h = typeAll(lex, s, { layout: "huffman" });
  const u = typeAll(lex, s, { layout: "uniform", predictions: 0 });
  assert.ok(h.perChar < 0.6 * u.perChar, `${h.perChar} vs ${u.perChar}`);
});

test("10% wrong choices still finish every sentence", () => {
  const r = typeAll(lex, ["hello how are you", "please call my wife"], { errorRate: 0.1, seed: 7 });
  assert.ok(r.perChar > 0);
});
