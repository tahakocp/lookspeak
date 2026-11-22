// A profile file lets a carer set up phrases and settings on one computer and move
// them, with the remembered words, to another (or keep a backup). Calibration and
// the voice stay behind: both belong to the machine, not the person.
import { Learner, type Snapshot } from "./learn.ts";
import { DEFAULTS, type Settings } from "./settings.ts";

export interface Profile {
  app: "lookspeak";
  v: 1;
  saved: string; // ISO date, shown before loading
  settings: Partial<Settings>;
  memory: Snapshot;
}

const PORTABLE = ["mode", "dwellMs", "sensitivity", "rate", "phrases", "smart", "scanMs", "blinkSelect", "lang"] as const;

export function exportProfile(s: Settings, memory: Learner, now = new Date()): Profile {
  const settings: Partial<Settings> = {};
  for (const k of PORTABLE) (settings as Record<string, unknown>)[k] = s[k];
  return { app: "lookspeak", v: 1, saved: now.toISOString(), settings, memory: memory.toJSON() };
}

// Throws with a message a carer can act on if the file is not a profile.
export function readProfile(text: string): Profile {
  let p: Partial<Profile>;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error("this file is not a lookspeak profile (not JSON)");
  }
  if (p?.app !== "lookspeak" || p.v !== 1 || typeof p.settings !== "object" || !p.settings) throw new Error("this file is not a lookspeak profile");
  const settings: Partial<Settings> = {};
  for (const k of PORTABLE) {
    const v = (p.settings as Record<string, unknown>)[k];
    if (v === undefined) continue;
    const want = k === "phrases" ? (Array.isArray(v) && v.every((x) => typeof x === "string")) || v === null : typeof v === typeof DEFAULTS[k];
    if (want) (settings as Record<string, unknown>)[k] = v;
  }
  return { app: "lookspeak", v: 1, saved: String(p.saved ?? ""), settings, memory: p.memory ?? { v: 1, words: {}, pairs: {}, phrases: {} } };
}

// Loading adds the file's memory to what this device already knows, so nothing is lost.
export function applyProfile(p: Profile, s: Settings, memory: Learner): Learner {
  Object.assign(s, p.settings);
  const merged = Learner.from(memory.toJSON());
  const incoming = Learner.from(p.memory);
  const add = (into: Map<string, number>, from: Map<string, number>) => {
    for (const [k, c] of from) into.set(k, (into.get(k) ?? 0) + c);
  };
  add(merged.words, incoming.words);
  add(merged.phrases, incoming.phrases);
  for (const [a, m] of incoming.pairs) {
    const into = merged.pairs.get(a) ?? new Map<string, number>();
    add(into, m);
    merged.pairs.set(a, into);
  }
  return Learner.from(merged.toJSON());
}
