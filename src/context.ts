// Turns a language model's next-token distribution into a distribution over the
// board's dictionary, so the halves follow the sentence typed so far.
//
// One forward pass per word, not per letter: the context only changes when a word
// is finished, and every dictionary word is scored through its first token. Words
// that share a first token (" therm" -> thermal, thermometer...) split that token's
// probability by their corpus counts.

export interface TokenMap {
  // two variants per word (as typed, Capitalized), at sentence start and after a space
  start: Int32Array;
  mid: Int32Array;
  startDenom: Float64Array;
  midDenom: Float64Array;
  counts: Float64Array;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function buildTokenMap(words: readonly string[], counts: ArrayLike<number>, vocab: number, firstToken: (text: string) => number): TokenMap {
  const n = words.length;
  const m: TokenMap = {
    start: new Int32Array(2 * n),
    mid: new Int32Array(2 * n),
    startDenom: new Float64Array(vocab),
    midDenom: new Float64Array(vocab),
    counts: Float64Array.from(counts),
  };
  for (let i = 0; i < n; i++) {
    const w = words[i];
    const variants = [w, cap(w)];
    for (let j = 0; j < 2; j++) {
      const s = firstToken(variants[j]);
      const t = firstToken(" " + variants[j]);
      m.start[2 * i + j] = s;
      m.mid[2 * i + j] = t;
      // "I" and "i" can share a token; count the word once per group
      if (j === 0 || s !== m.start[2 * i]) m.startDenom[s] += m.counts[i];
      if (j === 0 || t !== m.mid[2 * i]) m.midDenom[t] += m.counts[i];
    }
  }
  return m;
}

// P(word | context) for every dictionary word, summing to 1 (or all zero if the
// model put no mass on any dictionary word, which the caller treats as "no opinion").
export function wordWeights(map: TokenMap, probs: ArrayLike<number>, atStart: boolean): Float64Array {
  const tok = atStart ? map.start : map.mid;
  const denom = atStart ? map.startDenom : map.midDenom;
  const n = map.counts.length;
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = tok[2 * i], b = tok[2 * i + 1];
    let p = (probs[a] * map.counts[i]) / denom[a];
    if (b !== a) p += (probs[b] * map.counts[i]) / denom[b];
    out[i] = p;
    sum += p;
  }
  if (sum > 0) for (let i = 0; i < n; i++) out[i] /= sum;
  return out;
}

// The text the model sees: earlier sentences on their own lines, then the current
// one. The board is lowercase; the model was trained on normal writing.
export function contextText(words: readonly string[], history: readonly string[] = []): string {
  const sentence = (ws: readonly string[]) => ws.map((w, i) => (i === 0 || w === "i" || w.startsWith("i'") ? cap(w) : w)).join(" ");
  const lines = history.map((h) => sentence(h.split(/\s+/).filter(Boolean)) + ".");
  return lines.join("\n") + "\n" + sentence(words);
}

export function softmaxLast(logits: ArrayLike<number>, rows: number, vocab: number): Float32Array {
  const off = (rows - 1) * vocab;
  let max = -Infinity;
  for (let i = 0; i < vocab; i++) max = Math.max(max, logits[off + i]);
  const out = new Float32Array(vocab);
  let sum = 0;
  for (let i = 0; i < vocab; i++) sum += out[i] = Math.exp(logits[off + i] - max);
  for (let i = 0; i < vocab; i++) out[i] /= sum;
  return out;
}

// With nothing before it, the model's guess for a first word is worse than plain
// word frequencies (1.90 vs 1.85 looks/char on phrases 1-100), so it waits for
// either a word of this sentence or an earlier sentence.
export function hasContext(words: readonly string[], history: readonly string[]): boolean {
  return words.length > 0 || history.length > 0;
}

// Something that can answer "how likely is each dictionary word next?" without
// blocking. get() returns null until the answer is ready.
export interface ContextSource {
  get(words: readonly string[]): Float64Array | null;
}
