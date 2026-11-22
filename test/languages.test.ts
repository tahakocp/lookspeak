import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGUAGES } from "../src/languages.ts";
import { Lexicon } from "../src/lexicon.ts";
import { typeSentence } from "../src/simulate.ts";

const load = (code: string) => readFileSync(new URL(`../data/${code === "en" ? "words.txt" : `words-${code}.txt`}`, import.meta.url), "utf8");

for (const lang of LANGUAGES) {
  test(`${lang.name}: word list fits the letters and quick phrases can be typed`, () => {
    const letters = [...lang.letters];
    assert.equal(new Set(letters).size, letters.length, "duplicate letters");
    const lex = Lexicon.parse(load(lang.code), letters);
    assert.equal(lex.words.length, 20000);
    const ok = new Set(letters);
    for (const w of lex.words) assert.ok([...w].every((c) => ok.has(c)), `${w} has a letter outside the board`);
    assert.equal(lang.phrases.length, 12);
    // the board itself spells phrases without punctuation, lower case
    let sel = 0, chars = 0;
    for (const p of lang.phrases) {
      const s = p.toLocaleLowerCase(lang.code).replace(/[,.]/g, "");
      const r = typeSentence(lex, s);
      sel += r.selections;
      chars += r.chars;
    }
    // short phrases cost more per character than long text (speak is one look)
    assert.ok(sel / chars < 4, `${(sel / chars).toFixed(2)} looks per character`);
  });
}

test("Turkish dotless and dotted i are separate letters", () => {
  const tr = LANGUAGES.find((l) => l.code === "tr")!;
  const lex = Lexicon.parse(load("tr"), [...tr.letters]);
  const ids = new Set(lex.board("", { predictions: 0, hasText: false }).map((i) => i.id));
  assert.ok(ids.has("c:ı") && ids.has("c:i") && ids.has("c:ş") && !ids.has("c:q"));
});
