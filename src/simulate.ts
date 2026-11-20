import { isLeaf, pathTo } from "./huffman.ts";
import { Typer, type Choice, type Layout } from "./typer.ts";
import { Lexicon } from "./lexicon.ts";

// Plays a user who knows the target sentence and always takes the shortest route:
// a predicted word when the whole remaining word is offered, otherwise the next letter.
// errorRate flips a left/right choice; the user then looks up to go back one level
// (or deletes a wrongly committed item).

export interface SimResult {
  chars: number;
  selections: number;
  perChar: number;
  choices: Choice[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function typeSentence(
  lex: Lexicon,
  target: string,
  opts: { layout?: Layout; predictions?: number; errorRate?: number; seed?: number } = {},
): SimResult {
  const t = new Typer(lex, { layout: opts.layout ?? "huffman", predictions: opts.predictions ?? 4 });
  const rand = rng(opts.seed ?? 1);
  const err = opts.errorRate ?? 0;
  let selections = 0;
  const choices: Choice[] = [];
  const goal = target.trim() + " ";
  let guard = 0;

  while (t.text !== goal) {
    if (++guard > 5000) throw new Error(`stuck typing "${target}" at "${t.text}"`);
    let want: string;
    if (!goal.startsWith(t.text)) want = "delete";
    else {
      const start = t.text.length - t.prefix.length;
      const end = goal.indexOf(" ", t.text.length);
      const word = goal.slice(start, end);
      const ids = new Set(t.items().map((i) => i.id));
      const next = goal[t.text.length];
      want = ids.has("w:" + word) && t.prefix !== word ? "w:" + word : next === " " ? "space" : "c:" + next;
    }
    // only search the subtree we are in; if the target is not there, go up
    const route = pathTo(t.node, want);
    let c: Choice = route ? route[0] : "up";
    if (c !== "up" && err > 0 && rand() < err) c = c === "left" ? "right" : "left";
    t.choose(c);
    choices.push(c);
    selections++;
    if (isLeaf(t.node)) throw new Error("typer left on a leaf");
  }
  selections++; // final "speak" is at least one more selection; count it as one
  return { chars: goal.length - 1, selections, perChar: selections / (goal.length - 1), choices };
}

export function typeAll(lex: Lexicon, sentences: string[], opts: Parameters<typeof typeSentence>[2] = {}) {
  let chars = 0, selections = 0;
  sentences.forEach((s, i) => {
    const r = typeSentence(lex, s, { ...opts, seed: (opts.seed ?? 1) + i });
    chars += r.chars;
    selections += r.selections;
  });
  return { chars, selections, perChar: selections / chars };
}
