import { buildTree, buildUniform, isLeaf, type Item, type Node } from "./huffman.ts";
import { Lexicon } from "./lexicon.ts";

export type Choice = "left" | "right" | "up";
export type Layout = "huffman" | "uniform";

export interface TyperEvent {
  kind: "moved" | "typed" | "spoke" | "undone";
  item?: Item;
  text: string;
}

export class Typer {
  text = "";
  root!: Node;
  node!: Node;
  private path: Node[] = [];
  private undo: string[] = [];

  private lex: Lexicon;
  private opts: { predictions: number; layout: Layout };

  constructor(lex: Lexicon, opts: { predictions: number; layout: Layout } = { predictions: 4, layout: "huffman" }) {
    this.lex = lex;
    this.opts = opts;
    this.rebuild();
  }

  get prefix(): string {
    const i = this.text.lastIndexOf(" ");
    return this.text.slice(i + 1);
  }

  get depth(): number {
    return this.path.length;
  }

  items(): Item[] {
    return this.lex.board(this.prefix, { predictions: this.opts.predictions, hasText: this.text.length > 0 });
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
      this.text = "";
      kind = "spoke";
    }
    this.rebuild();
    return { kind, item, text: kind === "spoke" ? spoken : this.text };
  }
}
