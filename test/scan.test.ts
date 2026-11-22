import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTree, isLeaf, type Item, type Node } from "../src/huffman.ts";
import { BlinkSwitch, Scanner } from "../src/scan.ts";
import { Lexicon } from "../src/lexicon.ts";
import { typeAll, typeSentence } from "../src/simulate.ts";

const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));

// expected scan steps for a tree: first half costs 1, second 2
function cost(n: Node, total = n.weight): number {
  if (isLeaf(n)) return 0;
  return (n.left.weight + 2 * n.right.weight) / total + cost(n.left, total) + cost(n.right, total);
}

test("Huffman tree with the heavier half lit first is within 3% of the scanning bound", () => {
  // with costs 1 and 2 per choice, no code beats entropy / log2(phi) steps
  for (const prefix of ["", "t", "wh", "q", "th", "a"]) {
    const items: Item[] = lex.board(prefix, { predictions: 4, hasText: true });
    const W = items.reduce((s, i) => s + i.weight, 0);
    const H = -items.reduce((s, i) => s + (i.weight / W) * Math.log2(i.weight / W), 0);
    const bound = H / Math.log2((1 + Math.sqrt(5)) / 2);
    const c = cost(buildTree(items));
    assert.ok(c >= bound - 1e-9 && c < bound * 1.03, `${prefix}: ${c.toFixed(3)} vs bound ${bound.toFixed(3)}`);
  }
});

test("simulated switch user counts scan steps", () => {
  const r = typeSentence(lex, "please call my daughter");
  assert.ok(r.scanSteps > r.selections && r.scanSteps < 3 * r.selections);
  const all = typeAll(lex, ["i need water", "turn me over please"]);
  assert.ok(all.stepsPerChar > all.perChar);
});

test("scanner cycles left, right, up and restarts after a press", () => {
  const s = new Scanner(1000, 500);
  s.restart(0);
  assert.equal(s.current(0), "left");
  assert.equal(s.current(1499), "left");
  assert.equal(s.current(1500), "right");
  assert.equal(s.current(2600), "up");
  assert.equal(s.current(3600), "left");
  assert.equal(s.current(4600), "right");
  assert.equal(s.press(4700), "right");
  assert.equal(s.current(4800), "left");
});

function feed(sw: BlinkSwitch, segments: [number | null, number][], dt = 33): number {
  let t = 0, fired = 0;
  for (const [v, ms] of segments) for (const end = t + ms; t < end; t += dt) if (sw.update(v, t)) fired++;
  return fired;
}

test("long blink fires once, natural blinks and long closures do not", () => {
  assert.equal(feed(new BlinkSwitch(), [[0.1, 500], [0.9, 700], [0.1, 300]]), 1);
  assert.equal(feed(new BlinkSwitch(), [[0.1, 500], [0.9, 250], [0.1, 300], [0.8, 300], [0.1, 300]]), 0);
  assert.equal(feed(new BlinkSwitch(), [[0.1, 500], [0.9, 4000], [0.1, 300]]), 0);
  // a dropped frame or two during the blink is fine, a lost face is not
  assert.equal(feed(new BlinkSwitch(), [[0.1, 300], [0.9, 300], [null, 66], [0.9, 300], [0.1, 200]]), 1);
  assert.equal(feed(new BlinkSwitch(), [[0.1, 300], [0.9, 300], [null, 1000], [0.1, 200]]), 0);
});
