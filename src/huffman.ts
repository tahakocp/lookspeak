export interface Item {
  id: string;
  label: string;
  weight: number;
}

export type Node = { item: Item; weight: number } | { left: Node; right: Node; weight: number };

export function isLeaf(n: Node): n is { item: Item; weight: number } {
  return "item" in n;
}

// Huffman gives the minimum expected number of binary choices for the given weights.
// Ties break on insertion order so the same input always yields the same tree,
// which keeps item positions stable between repeated states.
export function buildTree(items: Item[]): Node {
  if (items.length === 0) throw new Error("no items");
  let seq = 0;
  type Q = { node: Node; seq: number };
  const queue: Q[] = items.map((item) => ({ node: { item, weight: Math.max(item.weight, 1e-9) }, seq: seq++ }));
  const cmp = (a: Q, b: Q) => a.node.weight - b.node.weight || a.seq - b.seq;
  queue.sort(cmp);
  while (queue.length > 1) {
    const a = queue.shift()!;
    const b = queue.shift()!;
    // heavier subtree goes left so the most likely item tends to sit on the same side
    const node: Node = { left: b.node, right: a.node, weight: a.node.weight + b.node.weight };
    const q = { node, seq: seq++ };
    let i = queue.findIndex((x) => cmp(q, x) < 0);
    if (i < 0) i = queue.length;
    queue.splice(i, 0, q);
  }
  return queue[0].node;
}

export function leaves(n: Node, out: Item[] = []): Item[] {
  if (isLeaf(n)) out.push(n.item);
  else {
    leaves(n.left, out);
    leaves(n.right, out);
  }
  return out;
}

export function depthOf(n: Node, id: string, d = 0): number {
  if (isLeaf(n)) return n.item.id === id ? d : -1;
  const l = depthOf(n.left, id, d + 1);
  return l >= 0 ? l : depthOf(n.right, id, d + 1);
}

// Path of 'left'/'right' choices that reaches the item, or null.
export function pathTo(n: Node, id: string): ("left" | "right")[] | null {
  if (isLeaf(n)) return n.item.id === id ? [] : null;
  const l = pathTo(n.left, id);
  if (l) return ["left", ...l];
  const r = pathTo(n.right, id);
  return r ? ["right", ...r] : null;
}

// Balanced split of an alphabetical list, the way most binary AAC boards do it.
export function buildUniform(items: Item[]): Node {
  if (items.length === 1) return { item: items[0], weight: items[0].weight };
  const mid = Math.ceil(items.length / 2);
  const left = buildUniform(items.slice(0, mid));
  const right = buildUniform(items.slice(mid));
  return { left, right, weight: left.weight + right.weight };
}
