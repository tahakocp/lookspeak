import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { Learner } from "../src/learn.ts";
import { Typer } from "../src/typer.ts";
import { pathTo } from "../src/huffman.ts";
import { typeSentence } from "../src/simulate.ts";

const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));
const split = (s: string) => new Typer(lex).words(s);

test("spoken words and the word after the previous one are offered as evidence", () => {
  const l = new Learner();
  l.observe("call maria please", split);
  l.observe("call maria now", split);
  const afterCall = l.candidates("", "call");
  assert.ok((afterCall.get("maria") ?? 0) > (afterCall.get("please") ?? 0));
  assert.ok((afterCall.get("maria") ?? 0) > (l.candidates("", "").get("maria") ?? 0));
});

test("an unknown name becomes a prediction after it has been spoken", () => {
  const l = new Learner();
  assert.equal(lex.count("zbigniew"), 0);
  const before = lex.board("", { predictions: 4, hasText: false }, l.candidates("", ""));
  assert.ok(!before.some((i) => i.id === "w:zbigniew"));
  l.observe("call zbigniew please", split);
  const after = lex.board("", { predictions: 4, hasText: false }, l.candidates("", "call"));
  assert.ok(after.some((i) => i.id === "w:zbigniew"));
});

test("board weights still sum to 1 after user evidence is mixed in", () => {
  const l = new Learner();
  l.observe("water water water", split);
  for (const p of ["", "wa", "zzq"]) {
    const items = lex.board(p, { predictions: 4, hasText: true }, l.candidates(p, ""));
    const sum = items.reduce((s, i) => s + i.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum ${sum} for "${p}"`);
  }
});

test("toJSON round-trips and clear forgets everything", () => {
  const l = new Learner();
  l.observe("hello maria", split);
  l.usePhrase("I am in pain");
  const copy = Learner.from(l.toJSON());
  assert.equal(copy.words.get("maria"), 1);
  assert.equal(copy.phrases.get("I am in pain"), 1);
  assert.equal(copy.candidates("", "hello").get("maria"), l.candidates("", "hello").get("maria"));
  l.clear();
  assert.equal(l.size, 0);
  assert.equal(l.phrases.size, 0);
  assert.equal(l.candidates("", "hello").size, 0);
  assert.equal(Learner.from(null).size, 0);
  assert.equal(Learner.from({ v: 2 as 1 }).size, 0);
});

test("prune halves counts and drops one-offs once the store is past its cap", () => {
  const l = new Learner();
  for (let i = 0; i < 3001; i++) l.observe(`word${i}`, (s) => [s]);
  assert.ok(l.size < 3001, `size ${l.size}`);
  // word0 was observed once, then halved to zero and dropped
  assert.equal(l.words.get("word0"), undefined);
});

test("typing a rare name a second time takes fewer looks", () => {
  const l = new Learner();
  const first = typeSentence(lex, "call zbigniew please", { learner: l });
  const second = typeSentence(lex, "call zbigniew please", { learner: l });
  assert.ok(second.selections < first.selections, `${second.selections} vs ${first.selections}`);
});

test("often-used quick phrases get a higher weight", () => {
  const l = new Learner();
  const t = new Typer(lex, { predictions: 4, layout: "huffman" }, l);
  const weight = (label: string) => {
    t.inPhrases = true;
    return t.items().find((i) => i.label === label)!.weight;
  };
  const before = weight("I am in pain");
  l.usePhrase("I am in pain");
  l.usePhrase("I am in pain");
  const after = weight("I am in pain");
  assert.ok(after > before);
  assert.equal(weight("yes"), before);
});

test("learner is consulted when the typer builds the board", () => {
  const l = new Learner();
  l.observe("call zbigniew please", split);
  const t = new Typer(lex, { predictions: 4, layout: "huffman" }, l);
  for (const c of pathTo(t.node, "c:c")!) t.choose(c);
  for (const c of pathTo(t.node, "c:a")!) t.choose(c);
  for (const c of pathTo(t.node, "c:l")!) t.choose(c);
  for (const c of pathTo(t.node, "c:l")!) t.choose(c);
  for (const c of pathTo(t.node, "space")!) t.choose(c);
  assert.equal(t.text, "call ");
  assert.ok(t.items().some((i) => i.id === "w:zbigniew"));
});
