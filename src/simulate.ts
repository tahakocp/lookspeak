import { isLeaf, pathTo } from "./huffman.ts";
import { Typer, type Choice, type Layout } from "./typer.ts";
import { Lexicon } from "./lexicon.ts";
import { Learner } from "./learn.ts";
import type { ContextSource } from "./context.ts";

// Plays a user who knows the target sentence and always takes the shortest route:
// a predicted word when the whole remaining word is offered, otherwise the next letter.
// errorRate flips a left/right choice; the user then looks up to go back one level
// (or deletes a wrongly committed item).

export interface SimResult {
  chars: number;
  selections: number;
  perChar: number;
  choices: Choice[];
  scanSteps: number; // highlight steps a switch user waits through (see scanCost)
}

// Steps until the wanted zone is highlighted when the board scans first half,
// second half, up, and starts over after each pick.
export const SCAN_STEP: Record<Choice, number> = { left: 1, right: 2, up: 3 };
export const scanCost = (cs: Choice[]) => cs.reduce((s, c) => s + SCAN_STEP[c], 0);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function typeSentence(
  lex: Lexicon,
  target: string,
  opts: { layout?: Layout; predictions?: number; errorRate?: number; seed?: number; learner?: Learner; context?: ContextSource; contextWeight?: number } = {},
): SimResult {
  const t = new Typer(
    lex,
    { layout: opts.layout ?? "huffman", predictions: opts.predictions ?? 4, contextWeight: opts.contextWeight },
    opts.learner ?? null,
    opts.context ?? null,
  );
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
  opts.learner?.observe(goal, (x) => t.words(x));
  const scanSteps = scanCost(choices) + 1;
  return { chars: goal.length - 1, selections, perChar: selections / (goal.length - 1), choices, scanSteps };
}

export function typeAll(lex: Lexicon, sentences: string[], opts: Parameters<typeof typeSentence>[2] = {}) {
  let chars = 0, selections = 0, scanSteps = 0;
  sentences.forEach((s, i) => {
    const r = typeSentence(lex, s, { ...opts, seed: (opts.seed ?? 1) + i });
    chars += r.chars;
    selections += r.selections;
    scanSteps += r.scanSteps;
  });
  return { chars, selections, perChar: selections / chars, scanSteps, stepsPerChar: scanSteps / chars };
}
