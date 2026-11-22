import { buildTree, buildUniform, isLeaf, type Item, type Node } from "./huffman.ts";
import { Lexicon } from "./lexicon.ts";
import { Learner } from "./learn.ts";
import type { ContextSource } from "./context.ts";

export type Choice = "left" | "right" | "up";
export type Layout = "huffman" | "uniform";
export interface TyperOptions {
  predictions: number;
  layout: Layout;
  contextWeight?: number; // share of the context model vs. corpus frequencies
}
export const CONTEXT_WEIGHT = 0.8;
const CHIME_KEY = "(chime)"; // usage count kept with the quick phrases

export interface TyperEvent {
  kind: "moved" | "typed" | "spoke" | "undone" | "chime";
  item?: Item;
  text: string;
}

export const DEFAULT_PHRASES = [
  "yes", "no", "thank you", "I need help", "I am in pain", "I am thirsty",
  "please wait", "I need the bathroom", "I am tired", "I love you", "please call the nurse", "turn me over please",
];

export class Typer {
  text = "";
  phrases: string[] = DEFAULT_PHRASES;
  inPhrases = false;
  root!: Node;
  node!: Node;
  private path: Node[] = [];
  private undo: string[] = [];

  private lex: Lexicon;
  private opts: TyperOptions;
  learner: Learner | null;
  context: ContextSource | null = null;
  private blended: { weights: Float64Array; lex: Lexicon } | null = null;

  constructor(
    lex: Lexicon,
    opts: TyperOptions = { predictions: 4, layout: "huffman" },
    learner: Learner | null = null,
    context: ContextSource | null = null,
  ) {
    this.lex = lex;
    this.opts = opts;
    this.learner = learner;
    this.context = context;
    this.rebuild();
  }

  // Words already finished in the current sentence (what the context model sees).
  get sentence(): string[] {
    return this.words(this.text.slice(0, this.text.length - this.prefix.length));
  }

  // The dictionary to use for the next item: weighted by the context model once it
  // has answered for this sentence, plain corpus frequencies until then.
  private lexicon(): Lexicon {
    if (!this.context) return this.lex;
    const w = this.context.get(this.sentence);
    if (!w) return this.lex;
    if (this.blended?.weights === w) return this.blended.lex;
    this.blended = { weights: w, lex: this.lex.blend(w, this.opts.contextWeight ?? CONTEXT_WEIGHT) };
    return this.blended.lex;
  }

  // Rebuild only if nothing has been chosen on this screen yet, so the halves never
  // change under a look that is already half way.
  refresh(): boolean {
    if (this.path.length || this.inPhrases) return false;
    this.rebuild();
    return true;
  }

  // Words of a sentence that the board could have typed, in order.
  words(sentence: string): string[] {
    const ok = new Set(this.lex.letters);
    return sentence.toLowerCase().split(/\s+/).filter((w) => w && [...w].every((ch) => ok.has(ch)));
  }

  get previousWord(): string {
    const ws = this.sentence;
    return ws[ws.length - 1] ?? "";
  }

  get prefix(): string {
    const i = this.text.lastIndexOf(" ");
    return this.text.slice(i + 1);
  }

  get depth(): number {
    return this.path.length;
  }

  items(): Item[] {
    if (this.inPhrases) {
      const back = { id: "back", label: "back to letters", weight: 1 };
      // phrases you pick often move towards the top of the tree
      const uses = (p: string) => this.learner?.phrases.get(p) ?? 0;
      // a sound to get someone's attention, for a user who cannot call out
      const chime = { id: "chime", label: "chime: call someone", weight: 1 + (this.learner?.phrases.get(CHIME_KEY) ?? 0) };
      return [back, chime, ...this.phrases.map((p, i) => ({ id: "p:" + i, label: p, weight: 1 + uses(p) }))];
    }
    const user = this.learner?.candidates(this.prefix, this.previousWord);
    const items = this.lexicon().board(this.prefix, { predictions: this.opts.predictions, hasText: this.text.length > 0 }, user);
    if (!this.text && this.phrases.length) {
      // the quick-phrase list only appears on an empty line; scale others to leave room
      for (const it of items) it.weight *= 0.92;
      items.push({ id: "phrases", label: "quick phrases", weight: 0.08 });
    }
    return items;
  }

  private rebuild() {
    const items = this.items();
    this.root = this.opts.layout === "huffman" ? buildTree(items) : buildUniform(items);
    this.node = this.root;
    this.path = [];
  }

  choose(c: Choice): TyperEvent {
    if (c === "up") {
      if (this.path.length) {
        this.node = this.path.pop()!;
        return { kind: "moved", text: this.text };
      }
      if (this.inPhrases) {
        this.inPhrases = false;
        this.rebuild();
        return { kind: "moved", text: this.text };
      }
      if (!this.undo.length) return { kind: "moved", text: this.text };
      this.text = this.undo.pop()!;
      this.rebuild();
      return { kind: "undone", text: this.text };
    }
    if (isLeaf(this.node)) throw new Error("tree has a single leaf");
    this.path.push(this.node);
    this.node = c === "left" ? this.node.left : this.node.right;
    if (!isLeaf(this.node)) return { kind: "moved", text: this.text };
    return this.apply(this.node.item);
  }

  apply(item: Item): TyperEvent {
    if (item.id === "phrases" || item.id === "back") {
      this.inPhrases = item.id === "phrases";
      this.rebuild();
      return { kind: "moved", item, text: this.text };
    }
    if (item.id === "chime") {
      this.learner?.usePhrase(CHIME_KEY);
      this.inPhrases = false;
      this.rebuild();
      return { kind: "chime", item, text: this.text };
    }
    if (item.id.startsWith("p:")) {
      this.learner?.usePhrase(item.label);
      this.inPhrases = false;
      this.rebuild();
      return { kind: "spoke", item, text: item.label };
    }
    this.undo.push(this.text);
    if (this.undo.length > 200) this.undo.shift();
    let kind: TyperEvent["kind"] = "typed";
    let spoken = "";
    const id = item.id;
    if (id.startsWith("c:")) this.text += id.slice(2);
    else if (id.startsWith("w:")) this.text = this.text.slice(0, this.text.length - this.prefix.length) + id.slice(2) + " ";
    else if (id === "space") this.text += " ";
    else if (id === "delete") this.text = this.text.slice(0, -1);
    else if (id === "speak") {
      spoken = this.text.trim();
      this.learner?.observe(spoken, (x) => this.words(x));
      this.text = "";
      kind = "spoke";
    }
    this.rebuild();
    return { kind, item, text: kind === "spoke" ? spoken : this.text };
  }
}
