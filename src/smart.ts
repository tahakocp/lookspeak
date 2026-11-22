import { hasContext, type ContextSource } from "./context.ts";
import type { FromWorker, ToWorker } from "./lm-worker.ts";
import type { Device } from "./lm.ts";

const CACHE_SIZE = 64; // 160 KB each

// Main-thread side of the language model: answers from a small cache and asks the
// worker for anything missing. The board calls get() on every rebuild; a miss returns
// null (plain word frequencies) and onUpdate fires when the answer arrives.
export class SmartPredictions implements ContextSource {
  state: "loading" | "ready" | "failed" = "loading";
  device = "";
  message = "";
  lastMs = 0;
  private fellBack = "";
  history: string[] = [];
  onUpdate: () => void = () => {};
  onStatus: () => void = () => {};

  private worker: Worker;
  private cache = new Map<string, Float64Array>();
  private pending = new Map<number, string>();
  private nextId = 0;

  private words: string[];
  private counts: Float64Array;

  constructor(words: string[], counts: Float64Array, device?: Device) {
    this.words = words;
    this.counts = counts;
    this.worker = this.start(device);
  }

  private start(device?: Device): Worker {
    const w = new Worker(new URL("lm/lm-worker.js", location.href), { type: "module" });
    w.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    w.onerror = (e) => this.fail(e.message || "worker failed to start");
    const base = new URL("lm/", location.href).href;
    w.postMessage({ type: "load", words: this.words, counts: this.counts, base, device } satisfies ToWorker);
    return w;
  }

  private send(m: ToWorker) {
    this.worker.postMessage(m);
  }

  private fail(message: string) {
    this.state = "failed";
    this.message = message;
    this.onStatus();
  }

  private receive(m: FromWorker) {
    if (m.type === "progress") {
      this.message = `${Math.round(m.loaded / 1e6)} MB`;
      this.onStatus();
    } else if (m.type === "slow") {
      this.worker.terminate();
      this.fellBack = `WebGPU took ${Number.isFinite(m.warmMs) ? Math.round(m.warmMs) + " ms" : "too long"} per word here`;
      this.worker = this.start("wasm");
    } else if (m.type === "ready") {
      this.state = "ready";
      this.device = `${m.device === "webgpu" ? "WebGPU" : "WebAssembly"}, ${m.dtype}`;
      this.lastMs = m.warmMs;
      this.message = `loaded in ${(m.ms / 1000).toFixed(1)} s${this.fellBack ? `; ${this.fellBack}` : ""}`;
      this.onStatus();
      this.onUpdate();
      this.keepOffline();
    } else if (m.type === "error") {
      this.pending.clear();
      if (this.state === "loading") this.fail(m.message);
      else {
        this.message = `last prediction failed: ${m.message}`;
        this.onStatus();
      }
    } else if (m.type === "result") {
      const key = this.pending.get(m.id);
      this.pending.delete(m.id);
      if (key === undefined) return;
      this.lastMs = m.ms;
      this.cache.set(key, m.weights);
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
      this.onUpdate();
    }
  }

  // On a first visit the worker can start before the service worker controls the
  // page, so its files miss the offline cache. Fetching them again once the service
  // worker is in charge stores them (they come from the HTTP cache, no new download).
  private async keepOffline() {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    await sw.ready;
    if (!sw.controller) await new Promise((r) => sw.addEventListener("controllerchange", r, { once: true }));
    const names = ["lm-worker.js", "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
    await Promise.all(names.map((n) => fetch(new URL("lm/" + n, location.href)).catch(() => null)));
  }

  get(words: readonly string[]): Float64Array | null {
    if (!hasContext(words, this.history)) return null;
    const key = this.history.join("\n") + "|" + words.join(" ");
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.state === "ready" && ![...this.pending.values()].includes(key)) {
      const id = this.nextId++;
      this.pending.set(id, key);
      this.send({ type: "predict", id, words: [...words], history: this.history });
    }
    return null;
  }

  // What the user just said becomes context for the next sentence.
  spoke(sentence: string) {
    this.history = [...this.history, sentence].slice(-2);
  }

  stop() {
    this.worker.terminate();
  }
}
