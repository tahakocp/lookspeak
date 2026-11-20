import type { Item } from "./huffman.ts";

export const LETTERS = "abcdefghijklmnopqrstuvwxyz'".split("");

export interface BoardOptions {
  predictions: number; // how many whole-word items to offer
  hasText: boolean; // speak/delete only make sense once something is typed
}

export class Lexicon {
  readonly words: string[];
  private counts: Float64Array;
  private cum: Float64Array; // cum[i] = sum of counts[0..i)
  private topAll: number[];

  constructor(entries: [string, number][]) {
    const sorted = [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    this.words = sorted.map((e) => e[0]);
    this.counts = Float64Array.from(sorted.map((e) => e[1]));
    this.cum = new Float64Array(this.counts.length + 1);
    for (let i = 0; i < this.counts.length; i++) this.cum[i + 1] = this.cum[i] + this.counts[i];
    this.topAll = [...this.counts.keys()].sort((a, b) => this.counts[b] - this.counts[a]).slice(0, 64);
  }

  static parse(text: string): Lexicon {
    const entries: [string, number][] = [];
    for (const line of text.split("\n")) {
      const [w, c] = line.trim().split(/\s+/);
      if (w && c) entries.push([w, Number(c)]);
    }
    return new Lexicon(entries);
  }

  private lower(p: string): number {
    let lo = 0, hi = this.words.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.words[m] < p) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  // Index range [a, b) of words starting with prefix.
  range(prefix: string): [number, number] {
    if (!prefix) return [0, this.words.length];
    return [this.lower(prefix), this.lower(prefix + "\uffff")];
  }

  mass(prefix: string): number {
    const [a, b] = this.range(prefix);
    return this.cum[b] - this.cum[a];
  }

  count(word: string): number {
    const i = this.lower(word);
    return this.words[i] === word ? this.counts[i] : 0;
  }

  top(prefix: string, k: number): string[] {
    if (!prefix) return this.topAll.slice(0, k).map((i) => this.words[i]);
    const [a, b] = this.range(prefix);
    const best: number[] = [];
    for (let i = a; i < b; i++) {
      if (best.length < k || this.counts[i] > this.counts[best[best.length - 1]]) {
        best.push(i);
        best.sort((x, y) => this.counts[y] - this.counts[x]);
        if (best.length > k) best.pop();
      }
    }
    return best.map((i) => this.words[i]);
  }

  // Items for one typing step, weighted by how likely each is to be the next thing typed.
  board(prefix: string, opt: BoardOptions): Item[] {
    const control = opt.hasText ? 0.05 : 0;
    const floor = 0.002; // unknown words and names must stay reachable
    const total = this.mass(prefix);
    const items: Item[] = [];

    // A word only earns its own item when it saves at least two selections' worth of letters.
    const preds = total > 0
      ? this.top(prefix, opt.predictions + 4).filter((w) => w.length >= prefix.length + 2).slice(0, opt.predictions)
      : [];
    const predMass = new Map<string, number>();
    for (const w of preds) {
      const c = this.count(w);
      items.push({ id: "w:" + w, label: w, weight: total ? c / total : 0 });
      const key = w[prefix.length];
      predMass.set(key, (predMass.get(key) ?? 0) + c);
    }

    const endWord = total ? this.count(prefix) / total : 0;
    for (const ch of LETTERS) {
      const m = total ? (this.mass(prefix + ch) - (predMass.get(ch) ?? 0)) / total : 0;
      items.push({ id: "c:" + ch, label: ch, weight: Math.max(m, 0) });
    }
    items.push({ id: "space", label: "space", weight: prefix ? endWord : 0 });

    let sum = items.reduce((s, it) => s + it.weight, 0);
    if (sum === 0) {
      // nothing in the dictionary starts like this (a name, a typo): spread over letters and space
      for (const it of items) it.weight = 1;
      sum = items.length;
    }
    const scale = (1 - 2 * control - floor * items.length) / sum;
    for (const it of items) it.weight = it.weight * scale + floor;
    if (opt.hasText) {
      items.push({ id: "speak", label: "speak", weight: control });
      items.push({ id: "delete", label: "delete", weight: control });
    }
    return items;
  }
}
