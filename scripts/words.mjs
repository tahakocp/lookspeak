// Rebuilds data/words-<lang>.txt: the 20,000 most frequent words of each language
// that can be spelled with that board's letters, from hermitdave/FrequencyWords
// (OpenSubtitles 2018, CC BY-SA 4.0). English (data/words.txt) was made the same way.
//   node scripts/words.mjs tr es
import { writeFileSync } from "node:fs";
import { LANGUAGES } from "../src/languages.ts";

const N = 20000;
const want = process.argv.slice(2);
for (const lang of LANGUAGES) {
  if (lang.code === "en" || (want.length && !want.includes(lang.code))) continue;
  const url = `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${lang.source}/${lang.source}_50k.txt`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const ok = new Set(lang.letters);
  const out = [];
  for (const line of (await r.text()).split("\n")) {
    const [w, c] = line.trim().split(" ");
    if (!w || !c) continue;
    const word = w.normalize("NFC");
    // a bare apostrophe or one at the start is a tokenizer artefact
    if (word.startsWith("'") || ![...word].every((ch) => ok.has(ch))) continue;
    out.push(`${word} ${c}`);
    if (out.length === N) break;
  }
  writeFileSync(new URL(`../data/words-${lang.code}.txt`, import.meta.url), out.join("\n") + "\n");
  console.log(`${lang.code}: ${out.length} words`);
}
