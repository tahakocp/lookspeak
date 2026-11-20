// Turns MediaPipe face blendshapes (or head pose) into one of a few coarse directions.
// Webcam gaze is only good to a few degrees, so we never try to place a cursor:
// the user only has to look clearly left, right or up.

export type Dir = "center" | "left" | "right" | "up" | "none";
export const TARGETS = ["center", "left", "right", "up"] as const;
export type Target = (typeof TARGETS)[number];

export interface Features {
  h: number; // > 0 when the user looks towards their own left
  v: number; // > 0 when looking up
  yaw: number; // head yaw in radians, > 0 turning to the user's left
  pitch: number; // head pitch, > 0 nodding up
  blink: number; // 0 open .. 1 closed, mean of both eyes
}

export type Blendshapes = Record<string, number>;

export function features(bs: Blendshapes, matrix?: ArrayLike<number>): Features {
  const g = (k: string) => bs[k] ?? 0;
  // MediaPipe names eyes from the subject's side: looking to your left moves the
  // left eye outwards and the right eye inwards.
  const h = (g("eyeLookOutLeft") + g("eyeLookInRight") - g("eyeLookInLeft") - g("eyeLookOutRight")) / 2;
  const v = (g("eyeLookUpLeft") + g("eyeLookUpRight") - g("eyeLookDownLeft") - g("eyeLookDownRight")) / 2;
  let yaw = 0, pitch = 0;
  if (matrix && matrix.length >= 16) {
    // column-major 4x4 rotation; forward axis is the third column
    const fx = matrix[8], fy = matrix[9], fz = matrix[10];
    yaw = Math.atan2(fx, fz);
    pitch = Math.atan2(fy, Math.hypot(fx, fz));
  }
  return { h, v, yaw, pitch, blink: (g("eyeBlinkLeft") + g("eyeBlinkRight")) / 2 };
}

export type Mode = "eyes" | "head";

function point(f: Features, mode: Mode): [number, number] {
  return mode === "eyes" ? [f.h, f.v] : [f.yaw, f.pitch];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Calibration {
  mode: Mode;
  centroids: Record<Target, [number, number]>;
}

export function calibrate(samples: Record<Target, Features[]>, mode: Mode): Calibration {
  const centroids = {} as Record<Target, [number, number]>;
  for (const t of TARGETS) {
    const pts = samples[t].filter((f) => f.blink < 0.5).map((f) => point(f, mode));
    if (pts.length < 5) throw new Error(`not enough open-eye samples for "${t}"`);
    centroids[t] = [median(pts.map((p) => p[0])), median(pts.map((p) => p[1]))];
  }
  const c = centroids.center;
  const spread = (t: Target) => Math.hypot(centroids[t][0] - c[0], centroids[t][1] - c[1]);
  const weakest = Math.min(spread("left"), spread("right"), spread("up"));
  const minSpread = mode === "eyes" ? 0.08 : 0.05;
  if (weakest < minSpread) throw new Error("left, right and up were too close to center; look further or try head mode");
  return { mode, centroids };
}

// Default centroids from typical blendshape values, used until the user calibrates.
export function defaultCalibration(mode: Mode): Calibration {
  return mode === "eyes"
    ? { mode, centroids: { center: [0, 0], left: [0.45, 0], right: [-0.45, 0], up: [0, 0.35] } }
    : { mode, centroids: { center: [0, 0], left: [0.3, 0], right: [-0.3, 0], up: [0, 0.22] } };
}

export class Classifier {
  cal: Calibration;
  sensitivity: number; // 0..1; a look counts once it is (1 - sensitivity) of the way to the target
  blinkThreshold: number;

  constructor(cal: Calibration, sensitivity = 0.5, blinkThreshold = 0.5) {
    this.cal = cal;
    this.sensitivity = sensitivity;
    this.blinkThreshold = blinkThreshold;
  }

  classify(f: Features | null): Dir {
    if (!f || f.blink > this.blinkThreshold) return "none";
    const [x, y] = point(f, this.cal.mode);
    const c = this.cal.centroids.center;
    let best: Dir = "center";
    let bestScore = 0;
    for (const t of ["left", "right", "up"] as const) {
      const [tx, ty] = this.cal.centroids[t];
      const dx = tx - c[0], dy = ty - c[1];
      const len2 = dx * dx + dy * dy;
      // progress along the center->target axis, 0 at center, 1 at the calibrated target
      const along = ((x - c[0]) * dx + (y - c[1]) * dy) / len2;
      if (along > 1 - this.sensitivity && along > bestScore) {
        bestScore = along;
        best = t;
      }
    }
    return best;
  }
}
