// 500 sentences per language from Tatoeba (CC BY 2.0 FR), downloaded on first use
// and not bundled. Tatoeba has no fixed test split, so the pick is deterministic
// on sentence ids: the 500 with the smallest id hash among sentences of 3-12 words
// that the board can spell. New sentences added upstream can shift numbers a little.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Bunzip from "seek-bzip";
import type { Language } from "../src/languages.ts";

const ISO3: Record<string, string> = { en: "eng", tr: "tur", es: "spa", de: "deu", fr: "fra", pt: "por", it: "ita" };

const hash = (id: number) => Math.imul(id, 2654435761) >>> 0;

export async function tatoeba(lang: Language, n = 500): Promise<string[]> {
  const code = ISO3[lang.code];
  const cache = new URL(`../node_modules/.cache/tatoeba-${code}.tsv`, import.meta.url);
  if (!existsSync(cache)) {
    mkdirSync(new URL(".", cache), { recursive: true });
    const url = `https://downloads.tatoeba.org/exports/per_language/${code}/${code}_sentences.tsv.bz2`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    writeFileSync(cache, Bunzip.decode(Buffer.from(await r.arrayBuffer())));
  }
  const ok = new Set(lang.letters + " ");
  const picked: [number, string][] = [];
  for (const line of readFileSync(cache, "utf8").split("\n")) {
    const [id, , text] = line.split("\t");
    if (!text) continue;
    const s = text
      .normalize("NFC")
      .toLocaleLowerCase(lang.code)
      .replace(/[’`]/g, "'")
      .replace(/[.,!?;:"«»“”„¡¿()…–—-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = s.split(" ");
    if (words.length < 3 || words.length > 12 || ![...s].every((ch) => ok.has(ch))) continue;
    picked.push([hash(Number(id)), s]);
  }
  return picked.sort((a, b) => a[0] - b[0]).slice(0, n).map((p) => p[1]);
}
