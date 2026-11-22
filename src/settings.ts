import type { Calibration, Mode } from "./gaze.ts";

export interface Settings {
  mode: Mode | "keys" | "scan";
  dwellMs: number;
  sensitivity: number;
  rate: number;
  voice: string;
  calibration: Calibration | null;
  phrases: string[] | null;
  smart: boolean; // context-aware predictions from the on-device language model
  scanMs: number; // one-switch mode: how long each zone stays lit
  blinkSelect: boolean; // one-switch mode: a long blink seen by the camera also picks
}

const KEY = "lookspeak.v1";
export const DEFAULTS: Settings = { mode: "eyes", dwellMs: 800, sensitivity: 0.5, rate: 1, voice: "", calibration: null, phrases: null, smart: false, scanMs: 1200, blinkSelect: false };

export function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
