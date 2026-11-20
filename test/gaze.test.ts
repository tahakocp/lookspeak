import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrate, Classifier, features, TARGETS, type Features, type Target } from "../src/gaze.ts";
import { Dwell } from "../src/dwell.ts";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const rand = rng(3);
const noise = (a: number) => (rand() - 0.5) * 2 * a;

// one user's blendshape geometry: smaller range than the defaults and a slight up bias
const truth: Record<Target, [number, number]> = { center: [0.02, 0.05], left: [0.3, 0.04], right: [-0.26, 0.06], up: [0.01, 0.3] };
const sample = (t: Target, n = 0.04): Features => ({ h: truth[t][0] + noise(n), v: truth[t][1] + noise(n), yaw: 0, pitch: 0, blink: 0.05 });

test("features: looking to the user's left gives positive h", () => {
  const f = features({ eyeLookOutLeft: 0.6, eyeLookInRight: 0.5 });
  assert.ok(f.h > 0.5);
  assert.equal(f.v, 0);
});

test("features: head yaw from a rotation matrix", () => {
  const a = 0.3; // rotation about y, column-major
  const m = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  assert.ok(Math.abs(features({}, m).yaw - a) < 1e-9);
});

test("calibrated classifier: >97% on noisy samples, center stays center", () => {
  const samples = Object.fromEntries(TARGETS.map((t) => [t, Array.from({ length: 40 }, () => sample(t))])) as Record<Target, Features[]>;
  const c = new Classifier(calibrate(samples, "eyes"));
  for (const t of TARGETS) {
    let ok = 0;
    for (let i = 0; i < 500; i++) if (c.classify(sample(t)) === t) ok++;
    assert.ok(ok / 500 > 0.97, `${t}: ${ok}/500`);
  }
});

test("calibration rejects a user who did not move their eyes", () => {
  const flat = Object.fromEntries(TARGETS.map((t) => [t, Array.from({ length: 40 }, () => sample("center"))])) as Record<Target, Features[]>;
  assert.throws(() => calibrate(flat, "eyes"), /too close/);
});

test("closed eyes classify as none", () => {
  const samples = Object.fromEntries(TARGETS.map((t) => [t, Array.from({ length: 40 }, () => sample(t))])) as Record<Target, Features[]>;
  const c = new Classifier(calibrate(samples, "eyes"));
  assert.equal(c.classify({ ...sample("left"), blink: 0.9 }), "none");
  assert.equal(c.classify(null), "none");
});

test("dwell fires once per look, tolerates a blink, needs center to re-arm", () => {
  const d = new Dwell(800, 250, 120);
  const fired: string[] = [];
  const feed = (dir: Parameters<Dwell["update"]>[0], from: number, to: number) => {
    for (let t = from; t < to; t += 33) {
      const f = d.update(dir, t);
      if (f) fired.push(`${f}@${t}`);
    }
  };
  feed("left", 0, 400);
  feed("none", 400, 550); // blink
  feed("left", 550, 2000); // keeps looking long after firing
  assert.equal(fired.length, 1);
  assert.match(fired[0], /^left@(79\d|8[0-3]\d)$/);
  feed("right", 2000, 3000); // no center in between: must not fire
  assert.equal(fired.length, 1);
  feed("center", 3000, 3200);
  feed("right", 3200, 4100);
  assert.equal(fired.length, 2);
});

test("dwell: a glance shorter than the dwell time never fires", () => {
  const d = new Dwell(800);
  for (let t = 0; t < 600; t += 33) assert.equal(d.update("up", t), null);
  for (let t = 600; t < 1000; t += 33) assert.equal(d.update("center", t), null);
});

test("dwell after reset ignores a held look until center is seen", () => {
  const d = new Dwell(800);
  d.reset();
  for (let t = 0; t < 2000; t += 33) assert.equal(d.update("up", t), null);
  for (let t = 2000; t < 2200; t += 33) d.update("center", t);
  let fired = null;
  for (let t = 2200; t < 3100 && !fired; t += 33) fired = d.update("up", t);
  assert.equal(fired, "up");
});
