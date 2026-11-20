import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Lexicon, LETTERS } from "../src/lexicon.ts";

const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));

test("loads the bundled word list", () => {
  assert.equal(lex.words.length, 20000);
  assert.ok(lex.count("water") > 0);
});

test("prefix mass and range agree", () => {
  const [a, b] = lex.range("wat");
  assert.ok(b > a);
  for (let i = a; i < b; i++) assert.ok(lex.words[i].startsWith("wat"));
  assert.ok(!lex.words[b]?.startsWith("wat"));
  assert.ok(lex.mass("wat") >= lex.count("water"));
});

test("top words are ordered by frequency", () => {
  const top = lex.top("th", 3);
  assert.equal(top[0], "the");
  assert.ok(lex.count(top[1]) >= lex.count(top[2]));
});

test("board weights sum to 1 and every letter is reachable", () => {
  for (const p of ["", "th", "zzq", "wat"]) {
    for (const hasText of [false, true]) {
      const items = lex.board(p, { predictions: 4, hasText });
      const sum = items.reduce((s, i) => s + i.weight, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `sum ${sum} for "${p}"`);
      for (const ch of LETTERS) assert.ok(items.some((i) => i.id === "c:" + ch));
      assert.ok(items.every((i) => i.weight > 0));
      assert.equal(items.some((i) => i.id === "speak"), hasText);
    }
  }
});

test("after 'wat' the letter e outweighs the letter z", () => {
  const items = lex.board("wat", { predictions: 0, hasText: true });
  const w = (id: string) => items.find((i) => i.id === id)!.weight;
  assert.ok(w("c:e") > 20 * w("c:z"));
});
