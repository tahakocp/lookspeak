import type { Choice } from "./typer.ts";

// Single-switch scanning: the zones light up one after another and one input (a
// key, a click anywhere, or a long blink) picks the lit one. Pure timing logic so
// it can be tested without a browser.
export const SCAN_ORDER: Choice[] = ["left", "right", "up"];

export class Scanner {
  stepMs: number;
  extraMs: number; // the first zone stays lit this much longer after each pick
  private start = -1;

  constructor(stepMs = 1000, extraMs = 500) {
    this.stepMs = stepMs;
    this.extraMs = extraMs;
  }

  private get firstMs(): number {
    return this.stepMs + this.extraMs;
  }

  restart(t: number) {
    this.start = t;
  }

  // Index into SCAN_ORDER lit at time t; cycles until something is picked.
  index(t: number): number {
    if (this.start < 0) this.start = t;
    const dt = t - this.start;
    if (dt < this.firstMs) return 0;
    return (Math.floor((dt - this.firstMs) / this.stepMs) + 1) % SCAN_ORDER.length;
  }

  current(t: number): Choice {
    return SCAN_ORDER[this.index(t)];
  }

  // Share of the current step that has passed, for the progress fill.
  progress(t: number): number {
    if (this.start < 0) return 0;
    const dt = t - this.start;
    if (dt < this.firstMs) return dt / this.firstMs;
    return ((dt - this.firstMs) % this.stepMs) / this.stepMs;
  }

  // The switch was pressed: returns the lit zone and starts over from the first.
  press(t: number): Choice {
    const c = this.current(t);
    this.restart(t);
    return c;
  }
}

// A deliberate long blink as a switch. Natural blinks last about 100-400 ms; the
// eyes have to stay closed for at least minMs, and a closure longer than maxMs
// (resting, dozing, looking down at the keyboard) is ignored. Fires when the eyes
// open again, so the user can feel the length of the blink.
export class BlinkSwitch {
  minMs: number;
  maxMs: number;
  threshold: number;
  private closedSince = -1;
  private lastSeen = -1;

  constructor(minMs = 500, maxMs = 2500, threshold = 0.55) {
    this.minMs = minMs;
    this.maxMs = maxMs;
    this.threshold = threshold;
  }

  // How long the eyes have been closed (0 when open), for a progress cue.
  closedFor(t: number): number {
    return this.closedSince < 0 ? 0 : t - this.closedSince;
  }

  // blink: 0 open .. 1 closed, or null when no face was found in this frame.
  update(blink: number | null, t: number): boolean {
    if (blink === null) {
      // a lost face for more than a moment cancels the blink in progress
      if (this.closedSince >= 0 && t - this.lastSeen > 400) this.closedSince = -1;
      return false;
    }
    this.lastSeen = t;
    if (blink >= this.threshold) {
      if (this.closedSince < 0) this.closedSince = t;
      return false;
    }
    if (this.closedSince < 0) return false;
    const held = t - this.closedSince;
    this.closedSince = -1;
    return held >= this.minMs && held <= this.maxMs;
  }
}
