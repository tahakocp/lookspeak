// Runs the language model off the main thread so gaze tracking never stalls.
import { env } from "@huggingface/transformers";
import { WordModel, type Device, type DType } from "./lm.ts";

export type ToWorker =
  | { type: "load"; words: string[]; counts: Float64Array; base: string; device?: Device }
  | { type: "predict"; id: number; words: string[]; history: string[] };
export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device: Device; dtype: DType; ms: number; warmMs: number }
  | { type: "slow"; warmMs: number }
  | { type: "error"; message: string }
  | { type: "result"; id: number; weights: Float64Array; ms: number };

let model: WordModel | null = null;
const SLOW_MS = 1000; // a prediction must fit comfortably inside one look (0.8 s dwell + 0.5 s)
const WARM_LIMIT_MS = 30_000;
const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function pickDevice(): Promise<{ device: Device; dtype: DType }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  if (!adapter) return { device: "wasm", dtype: "q4" };
  return { device: "webgpu", dtype: adapter.features.has("shader-f16") ? "q4f16" : "q4" };
}

async function load(msg: Extract<ToWorker, { type: "load" }>) {
  const t0 = performance.now();
  // the WebAssembly runtime is served next to the app instead of from a CDN
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } };
  if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: msg.base + "ort-wasm-simd-threaded.asyncify.mjs", wasm: msg.base + "ort-wasm-simd-threaded.asyncify.wasm" };
  let pick = msg.device ? { device: msg.device, dtype: (msg.device === "webgpu" ? "q4f16" : "q4") as DType } : await pickDevice();
  const files = new Map<string, [number, number]>();
  const progress = (p: unknown) => {
    const e = p as { status?: string; file?: string; loaded?: number; total?: number };
    if (e.status !== "progress" || !e.file) return;
    files.set(e.file, [e.loaded ?? 0, e.total ?? 0]);
    let loaded = 0, total = 0;
    for (const [l, t] of files.values()) (loaded += l), (total += t);
    post({ type: "progress", loaded, total });
  };
  try {
    model = await WordModel.load(msg.words, msg.counts, pick.device, pick.dtype, progress);
  } catch (e) {
    if (pick.device !== "webgpu") throw e;
    // some GPUs advertise WebGPU but fail on the model's kernels
    pick = { device: "wasm", dtype: "q4" };
    model = await WordModel.load(msg.words, msg.counts, pick.device, pick.dtype, progress);
  }
  // The first call compiles GPU kernels; the second shows the real speed. Software
  // WebGPU (no GPU driver) answers in seconds, which is worse than WebAssembly, and a
  // broken driver can hang, so both cases hand over to WebAssembly.
  const m = model;
  const warm = async () => {
    await m.predict([]);
    const t = performance.now();
    await m.predict(["i"]);
    return performance.now() - t;
  };
  const limit = new Promise<number>((r) => setTimeout(() => r(Infinity), WARM_LIMIT_MS));
  const warmMs = await Promise.race([warm(), limit]).catch(() => Infinity);
  if (pick.device === "webgpu" && warmMs > SLOW_MS) {
    post({ type: "slow", warmMs });
    return;
  }
  post({ type: "ready", ...pick, ms: performance.now() - t0, warmMs });
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") await load(msg);
    else if (msg.type === "predict" && model) {
      const t0 = performance.now();
      const weights = await model.predict(msg.words, msg.history);
      post({ type: "result", id: msg.id, weights, ms: performance.now() - t0 }, [weights.buffer]);
    }
  } catch (err) {
    post({ type: "error", message: (err as Error).message ?? String(err) });
  }
};
