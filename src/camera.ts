import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { features, type Blendshapes, type Features } from "./gaze.ts";

export class FaceTracker {
  private fl: FaceLandmarker;
  readonly video: HTMLVideoElement;
  readonly delegate: string;
  private lastTs = -1;

  private constructor(fl: FaceLandmarker, video: HTMLVideoElement, delegate: string) {
    this.fl = fl;
    this.video = video;
    this.delegate = delegate;
  }

  static async create(video: HTMLVideoElement, base = "./vendor"): Promise<FaceTracker> {
    const fileset = await FilesetResolver.forVisionTasks(`${base}/wasm`);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    let fl: FaceLandmarker;
    let delegate = "GPU";
    try {
      fl = await make("GPU");
    } catch {
      // no WebGL2 (some VMs, older laptops): the CPU path is slower but works
      delegate = "CPU";
      fl = await make("CPU");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    return new FaceTracker(fl, video, delegate);
  }

  detect(now: number): Features | null {
    if (this.video.readyState < 2) return null;
    const ts = Math.max(now, this.lastTs + 1); // MediaPipe needs strictly increasing timestamps
    this.lastTs = ts;
    const r = this.fl.detectForVideo(this.video, ts);
    const cats = r.faceBlendshapes?.[0]?.categories;
    if (!cats) return null;
    const bs: Blendshapes = {};
    for (const c of cats) bs[c.categoryName] = c.score;
    return features(bs, r.facialTransformationMatrixes?.[0]?.data);
  }

  stop() {
    for (const t of (this.video.srcObject as MediaStream | null)?.getTracks() ?? []) t.stop();
    this.fl.close();
  }
}
