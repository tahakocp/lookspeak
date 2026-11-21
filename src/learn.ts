// What the user has actually said, kept on their device. Used two ways:
// words they use often (including names the dictionary lacks) get cheaper, and
// the word they usually say after the previous one is offered as a prediction.

export interface Snapshot {
  v: 1;
  words: Record<string, number>;
  pairs: Record<string, Record<string, number>>;
  phrases: Record<string, number>;
}

const MAX_WORDS = 3000;
const MAX_PAIRS = 6000;

export class Learner {
  words = new Map<string, number>();
  pairs = new Map<string, Map<string, number>>();
  phrases = new Map<string, number>();
  private pairCount = 0;

  static from(s: Partial<Snapshot> | null | undefined): Learner {
    const l = new Learner();
    if (!s || s.v !== 1) return l;
    for (const [w, c] of Object.entries(s.words ?? {})) l.words.set(w, c);
    for (const [a, nexts] of Object.entries(s.pairs ?? {})) {
      const m = new Map(Object.entries(nexts));
      l.pairs.set(a, m);
      l.pairCount += m.size;
    }
    for (const [p, c] of Object.entries(s.phrases ?? {})) l.phrases.set(p, c);
    return l;
  }

  toJSON(): Snapshot {
    const pairs: Snapshot["pairs"] = {};
    for (const [a, m] of this.pairs) pairs[a] = Object.fromEntries(m);
    return { v: 1, words: Object.fromEntries(this.words), pairs, phrases: Object.fromEntries(this.phrases) };
  }

  get size(): number {
    return this.words.size;
  }

  observe(sentence: string, split: (s: string) => string[]) {
    const ws = split(sentence);
    let prev = "";
    for (const w of ws) {
      this.words.set(w, (this.words.get(w) ?? 0) + 1);
      if (prev) {
        let m = this.pairs.get(prev);
        if (!m) this.pairs.set(prev, (m = new Map()));
        if (!m.has(w)) this.pairCount++;
        m.set(w, (m.get(w) ?? 0) + 1);
      }
      prev = w;
    }
    this.prune();
  }

  usePhrase(p: string) {
    this.phrases.set(p, (this.phrases.get(p) ?? 0) + 1);
  }

  // Evidence for each word that starts with prefix: own use counts, plus a larger
  // share when the user has said it right after `prev` before.
  candidates(prefix: string, prev: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const [w, c] of this.words) if (w.startsWith(prefix)) out.set(w, c);
    const m = prev ? this.pairs.get(prev) : undefined;
    if (m) for (const [w, c] of m) if (w.startsWith(prefix)) out.set(w, (out.get(w) ?? 0) + 4 * c);
    return out;
  }

  clear() {
    this.words.clear();
    this.pairs.clear();
    this.phrases.clear();
    this.pairCount = 0;
  }

  // Halve every count once the store grows past its cap; rare one-offs drop out.
  private prune() {
    if (this.words.size <= MAX_WORDS && this.pairCount <= MAX_PAIRS) return;
    const halve = (m: Map<string, number>) => {
      for (const [k, c] of m) {
        const h = Math.floor(c / 2);
        if (h) m.set(k, h);
        else m.delete(k);
      }
    };
    halve(this.words);
    this.pairCount = 0;
    for (const [a, m] of this.pairs) {
      halve(m);
      if (!m.size) this.pairs.delete(a);
      this.pairCount += m.size;
    }
  }
}

const LEARN_KEY = "lookspeak.learn.v1";

export function loadLearner(): Learner {
  if (typeof localStorage === "undefined") return new Learner();
  try {
    return Learner.from(JSON.parse(localStorage.getItem(LEARN_KEY) ?? "null"));
  } catch {
    return new Learner();
  }
}

export function saveLearner(l: Learner) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LEARN_KEY, JSON.stringify(l.toJSON()));
}
