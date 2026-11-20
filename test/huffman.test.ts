import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, buildUniform, depthOf, leaves, pathTo } from "../src/huffman.ts";

const items = [
  { id: "a", label: "a", weight: 0.5 },
  { id: "b", label: "b", weight: 0.25 },
  { id: "c", label: "c", weight: 0.125 },
  { id: "d", label: "d", weight: 0.125 },
];

test("huffman depths match -log2(p) for dyadic weights", () => {
  const t = buildTree(items);
  assert.deepEqual(items.map((i) => depthOf(t, i.id)), [1, 2, 3, 3]);
});

test("every item stays reachable and paths are consistent", () => {
  const t = buildTree(items);
  assert.equal(leaves(t).length, 4);
  for (const i of items) assert.equal(pathTo(t, i.id)!.length, depthOf(t, i.id));
});

test("tree is deterministic for equal weights", () => {
  const eq = "abcdefg".split("").map((id) => ({ id, label: id, weight: 1 }));
  assert.deepEqual(leaves(buildTree(eq)).map((i) => i.id), leaves(buildTree(eq)).map((i) => i.id));
});

test("uniform split keeps alphabetical order and has log2 depth", () => {
  const eq = "abcdefgh".split("").map((id) => ({ id, label: id, weight: 1 }));
  const t = buildUniform(eq);
  assert.deepEqual(leaves(t).map((i) => i.id).join(""), "abcdefgh");
  for (const i of eq) assert.equal(depthOf(t, i.id), 3);
});

test("single item tree is a leaf", () => {
  assert.ok("item" in buildTree([items[0]]));
  assert.throws(() => buildTree([]));
});
