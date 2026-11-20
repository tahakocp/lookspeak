import type { Dir } from "./gaze.ts";

export type Fired = "left" | "right" | "up";

// A direction fires after it is held for dwellMs. Short "none" gaps (blinks, a
// dropped frame) do not reset the timer. After firing, the user must come back to
// center before anything else can fire, so one long look never selects twice.
export class Dwell {
  private cand: Fired | null = null;
  private since = 0;
  private lastSeen = 0;
  private armed = true;
  private centerSince = -1;

  dwellMs: number;
  gapMs: number;
  rearmMs: number;

  constructor(dwellMs = 800, gapMs = 250, rearmMs = 120) {
    this.dwellMs = dwellMs;
    this.gapMs = gapMs;
    this.rearmMs = rearmMs;
  }

  progress(t: number): number {
    return this.cand && this.armed ? Math.min(1, (t - this.since) / this.dwellMs) : 0;
  }

  get candidate(): Fired | null {
    return this.armed ? this.cand : null;
  }

  get isArmed(): boolean {
    return this.armed;
  }

  update(d: Dir, t: number): Fired | null {
    if (d === "none") {
      if (this.cand && t - this.lastSeen > this.gapMs) this.cand = null;
      return null;
    }
    if (d === "center") {
      this.cand = null;
      if (!this.armed) {
        if (this.centerSince < 0) this.centerSince = t;
        if (t - this.centerSince >= this.rearmMs) this.armed = true;
      }
      return null;
    }
    this.centerSince = -1;
    if (!this.armed) return null;
    if (d !== this.cand) {
      this.cand = d;
      this.since = t;
    }
    this.lastSeen = t;
    if (t - this.since >= this.dwellMs) {
      this.armed = false;
      this.cand = null;
      return d;
    }
    return null;
  }
}
