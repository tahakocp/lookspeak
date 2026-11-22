// Looks per character for every board language on 500 Tatoeba sentences each
// (downloads about 70 MB once). English is included to compare with the
// MacKenzie numbers from `npm run bench`.
import { readFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { typeAll } from "../src/simulate.ts";
import { LANGUAGES } from "../src/languages.ts";
import { tatoeba } from "./tatoeba.ts";

const secPerSel = (Number(process.env.DWELL_MS ?? 800) + Number(process.env.RETURN_MS ?? 500)) / 1000;
const only = process.argv.slice(2);
console.log("| language | letters | sentences, chars | alphabetical halves | frequency halves + 4 words | words / min |");
console.log("|---|---|---|---|---|---|");
for (const lang of LANGUAGES) {
  if (only.length && !only.includes(lang.code)) continue;
  const file = lang.code === "en" ? "words.txt" : `words-${lang.code}.txt`;
  const lex = Lexicon.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"), [...lang.letters]);
  const s = await tatoeba(lang);
  const uni = typeAll(lex, s, { layout: "uniform", predictions: 0 });
  const def = typeAll(lex, s);
  const cpm = 60 / (def.perChar * secPerSel);
  console.log(`| ${lang.name} | ${lang.letters.length} | ${s.length}, ${def.chars} | ${uni.perChar.toFixed(2)} | ${def.perChar.toFixed(2)} | ${(cpm / 5).toFixed(1)} |`);
}
