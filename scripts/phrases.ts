// MacKenzie & Soukoreff (2003) phrase set, the standard benchmark in text-entry
// research. Downloaded on first use, not bundled.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const URL_ = "https://www.yorku.ca/mack/phrases2.txt";
const cache = new URL("../node_modules/.cache/phrases2.txt", import.meta.url);

export async function loadPhrases(): Promise<string[]> {
  if (!existsSync(cache)) {
    mkdirSync(new URL(".", cache), { recursive: true });
    const r = await fetch(URL_);
    if (!r.ok) throw new Error(`download failed: ${r.status}`);
    writeFileSync(cache, await r.text());
  }
  return readFileSync(cache, "utf8")
    .split("\n")
    .map((s) => s.trim().toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " "))
    .filter(Boolean);
}
