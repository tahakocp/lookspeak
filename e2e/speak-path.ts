import { readFileSync } from "node:fs";
import { Lexicon } from "../src/lexicon.ts";
import { Typer } from "../src/typer.ts";
import { pathTo } from "../src/huffman.ts";
import { typeSentence } from "../src/simulate.ts";

const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));
const t = new Typer(lex);
for (const c of typeSentence(lex, process.argv[2]).choices) t.choose(c);
console.log(JSON.stringify(pathTo(t.node, "speak")));
