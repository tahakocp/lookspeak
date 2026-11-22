import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProfile, exportProfile, readProfile } from "../src/profile.ts";
import { DEFAULTS } from "../src/settings.ts";
import { Learner } from "../src/learn.ts";

const words = (s: string) => s.split(" ");

test("profile round trip keeps settings and memory, not calibration or voice", () => {
  const s = { ...DEFAULTS, dwellMs: 1200, lang: "tr", phrases: ["evet", "hayır"], voice: "Some Voice", calibration: { mode: "eyes" as const, centroids: { center: [0, 0], left: [1, 0], right: [-1, 0], up: [0, 1] } as never } };
  const mem = new Learner();
  mem.observe("call zbigniew now", words);
  mem.usePhrase("evet");
  const text = JSON.stringify(exportProfile(s, mem, new Date("2026-11-22T10:00:00Z")));
  assert.ok(!text.includes("Some Voice") && !text.includes("centroids"));

  const here = { ...DEFAULTS, calibration: s.calibration };
  const learned = applyProfile(readProfile(text), here, new Learner());
  assert.equal(here.dwellMs, 1200);
  assert.equal(here.lang, "tr");
  assert.deepEqual(here.phrases, ["evet", "hayır"]);
  assert.equal(here.calibration, s.calibration);
  assert.equal(learned.words.get("zbigniew"), 1);
  assert.equal(learned.phrases.get("evet"), 1);
});

test("loading adds to what this device remembers", () => {
  const a = new Learner();
  a.observe("i need water", words);
  const b = new Learner();
  b.observe("i need my glasses", words);
  const merged = applyProfile(readProfile(JSON.stringify(exportProfile(DEFAULTS, a))), { ...DEFAULTS }, b);
  assert.equal(merged.words.get("need"), 2);
  assert.equal(merged.words.get("water"), 1);
  assert.equal(merged.words.get("glasses"), 1);
});

test("bad files are refused with a readable message, bad fields are dropped", () => {
  assert.throws(() => readProfile("hello"), /not a lookspeak profile/);
  assert.throws(() => readProfile(JSON.stringify({ app: "other", v: 1, settings: {} })), /not a lookspeak profile/);
  const p = readProfile(JSON.stringify({ app: "lookspeak", v: 1, settings: { dwellMs: "fast", rate: 1.5, phrases: [1, 2], evil: true } }));
  assert.deepEqual(p.settings, { rate: 1.5 });
});
