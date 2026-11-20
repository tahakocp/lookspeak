import { leaves, isLeaf, type Item } from "./huffman.ts";
import { Lexicon } from "./lexicon.ts";
import { Typer, DEFAULT_PHRASES, type Choice } from "./typer.ts";
import { calibrate, Classifier, defaultCalibration, TARGETS, type Dir, type Features, type Target } from "./gaze.ts";
import { Dwell } from "./dwell.ts";
import { FaceTracker } from "./camera.ts";
import { load, save, type Settings } from "./settings.ts";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const screens = ["start", "calib", "board"] as const;
function show(id: (typeof screens)[number]) {
  for (const s of screens) $("#" + s).hidden = s !== id;
}

const settings: Settings = load();
let typer: Typer;
let tracker: FaceTracker | null = null;
let classifier: Classifier | null = null;
const dwell = new Dwell(settings.dwellMs);
let onFrame: ((f: Features | null, t: number) => void) | null = null;
const stats = { frames: 0, faces: 0, fired: 0, since: performance.now(), fps: 0, lastDir: "none" as Dir, choices: [] as Choice[] };

// ---------- speech ----------
function voices() {
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}
function say(text: string) {
  if (!text || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voices().find((x) => x.name === settings.voice);
  if (v) u.voice = v;
  u.rate = settings.rate;
  speechSynthesis.speak(u);
}

// ---------- board rendering ----------
const order = (it: Item) => (it.id.startsWith("w:") || it.id.startsWith("p:") ? 0 : it.id.startsWith("c:") ? 1 : 2);
function renderHalf(el: HTMLElement, items: Item[]) {
  const box = el.querySelector(".items")!;
  box.replaceChildren();
  box.classList.toggle("many", items.length > 14);
  const sorted = [...items].sort((a, b) => order(a) - order(b) || (order(a) === 1 ? a.label.localeCompare(b.label) : b.weight - a.weight));
  for (const it of sorted) {
    const s = document.createElement("span");
    const kind = order(it);
    s.className = kind === 0 ? "w" : kind === 1 ? "c" : "k";
    s.textContent = it.id === "space" ? "␣ space" : it.label;
    box.append(s);
  }
}
function render() {
  const n = typer.node;
  if (isLeaf(n)) return;
  renderHalf($("#left"), leaves(n.left));
  renderHalf($("#right"), leaves(n.right));
  $("#text").textContent = typer.text;
  $("#up-label").textContent = typer.depth > 0 ? "back" : typer.inPhrases ? "back to letters" : "undo";
}

function choose(c: Choice) {
  stats.fired++;
  stats.choices.push(c);
  if (stats.choices.length > 50) stats.choices.shift();
  const ev = typer.choose(c);
  if (ev.kind === "spoke") {
    say(ev.text);
    $("#status").textContent = `said: "${ev.text}"`;
  }
  render();
}

function paintDwell(t: number) {
  const cand = dwell.candidate;
  for (const z of ["left", "right", "up"] as const) {
    const el = $("#" + z);
    const on = cand === z;
    el.classList.toggle("active", on);
    el.style.setProperty("--p", on ? String(dwell.progress(t)) : "0");
  }
}

// ---------- camera loop ----------
function loop() {
  const t = performance.now();
  let f: Features | null = null;
  if (tracker) {
    f = tracker.detect(t);
    stats.frames++;
    if (f) stats.faces++;
    if (t - stats.since > 1000) {
      stats.fps = (stats.frames * 1000) / (t - stats.since);
      stats.frames = 0;
      stats.since = t;
    }
  }
  if (onFrame) onFrame(f, t);
  requestAnimationFrame(loop);
}

function boardFrame(f: Features | null, t: number) {
  if (!classifier) return;
  const d = classifier.classify(f);
  stats.lastDir = d;
  const fired = dwell.update(d, t);
  paintDwell(t);
  if (fired) choose(fired);
  if (!f) $("#status").textContent = "no face found: check light and camera angle";
}

// ---------- calibration ----------
const DOT: Record<Target, [string, string]> = {
  center: ["50%", "50%"],
  left: ["4%", "50%"],
  right: ["96%", "50%"],
  up: ["50%", "6%"],
};
const STEP_MS = 2400, SKIP_MS = 900; // first part of each step is the eye moving, not fixating

function runCalibration(): Promise<void> {
  show("calib");
  const dot = $("#dot");
  const msg = $("#calib-msg");
  const samples = Object.fromEntries(TARGETS.map((t) => [t, [] as Features[]])) as Record<Target, Features[]>;
  const plan: Target[] = ["center", "left", "center", "right", "center", "up", "center"];
  return new Promise((resolve) => {
    let i = -1, stepStart = 0;
    const next = (t: number) => {
      i++;
      if (i >= plan.length) {
        onFrame = null;
        try {
          const mode = settings.mode === "head" ? "head" : "eyes";
          settings.calibration = calibrate(samples, mode);
          save(settings);
          resolve();
        } catch (e) {
          msg.textContent = `${(e as Error).message}. Click or press any key to try again.`;
          const retry = () => runCalibration().then(resolve);
          addEventListener("keydown", retry, { once: true });
          addEventListener("click", retry, { once: true });
        }
        return;
      }
      const target = plan[i];
      stepStart = t;
      dot.style.left = `calc(${DOT[target][0]} - 28px)`;
      dot.style.top = `calc(${DOT[target][1]} - 28px)`;
      const verb = settings.mode === "head" ? "Turn your head towards" : "Look at";
      msg.textContent = target === "center" ? `${verb} the dot` : `${verb} the dot on the ${target === "up" ? "top" : target}`;
    };
    onFrame = (f, t) => {
      if (i < 0) next(t);
      if (i >= plan.length) return;
      if (f && t - stepStart > SKIP_MS) samples[plan[i]].push(f);
      if (t - stepStart > STEP_MS) next(t);
    };
  });
}

// ---------- start ----------
async function startBoard() {
  show("board");
  render();
  if (settings.mode === "keys") {
    $("#cam").classList.add("off");
    $("#status").textContent = "keys: ← → choose, ↑ undo. Or click a half.";
    onFrame = null;
    return;
  }
  const cal = settings.calibration?.mode === settings.mode ? settings.calibration : defaultCalibration(settings.mode);
  classifier = new Classifier(cal, settings.sensitivity);
  dwell.dwellMs = settings.dwellMs;
  dwell.reset();
  $("#status").textContent = `${settings.mode} mode, ${tracker?.delegate ?? ""} inference`;
  onFrame = boardFrame;
}

async function begin(mode: Settings["mode"]) {
  settings.mode = mode;
  save(settings);
  if (mode !== "keys") {
    $("#start-status").textContent = "Loading the face model (3.7 MB, cached after the first visit)...";
    try {
      tracker ??= await FaceTracker.create($<HTMLVideoElement>("#cam"));
    } catch (e) {
      $("#start-status").textContent = `Camera or model failed: ${(e as Error).message}. Keys mode still works.`;
      return;
    }
    if (!settings.calibration || settings.calibration.mode !== mode) await runCalibration();
  }
  await startBoard();
}

// ---------- settings dialog ----------
function openSettings() {
  const dlg = $<HTMLDialogElement>("#settings");
  const bind = (id: string, key: "dwellMs" | "sensitivity" | "rate", fmt: (v: number) => string) => {
    const inp = $<HTMLInputElement>("#" + id);
    const out = $("#" + id.replace(/^(dwell|sens|rate).*/, "$1") + "-out");
    inp.value = String(settings[key]);
    out.textContent = fmt(settings[key]);
    inp.oninput = () => {
      settings[key] = Number(inp.value);
      out.textContent = fmt(settings[key]);
    };
  };
  bind("dwell", "dwellMs", (v) => `${v} ms`);
  bind("sens", "sensitivity", (v) => v.toFixed(2));
  bind("rate", "rate", (v) => v.toFixed(1));
  const sel = $<HTMLSelectElement>("#voice");
  sel.replaceChildren(new Option("system default", ""), ...voices().map((v) => new Option(v.name, v.name, false, v.name === settings.voice)));
  const ta = $<HTMLTextAreaElement>("#phrases");
  ta.value = typer.phrases.join("\n");
  dlg.onclose = () => {
    settings.voice = sel.value;
    const lines = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
    settings.phrases = lines.length ? lines : null;
    typer.phrases = settings.phrases ?? DEFAULT_PHRASES;
    save(settings);
    dwell.dwellMs = settings.dwellMs;
    if (classifier) classifier.sensitivity = settings.sensitivity;
    if (dlg.returnValue === "mode") {
      onFrame = null;
      show("start");
    }
    render();
  };
  dlg.showModal();
}

async function main() {
  const lex = Lexicon.parse(await (await fetch("words.txt")).text());
  typer = new Typer(lex);
  if (settings.phrases) typer.phrases = settings.phrases;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) b.onclick = () => begin(b.dataset.mode as Settings["mode"]);
  $("#left").onclick = () => choose("left");
  $("#right").onclick = () => choose("right");
  $("#up").onclick = () => choose("up");
  $("#menu").onclick = openSettings;
  $("#recal").onclick = async () => {
    if (settings.mode === "keys") return;
    await runCalibration();
    await startBoard();
  };
  addEventListener("keydown", (e) => {
    if ($("#board").hidden || $<HTMLDialogElement>("#settings").open) return;
    const k: Record<string, Choice> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", "1": "left", "2": "right", Backspace: "up" };
    if (k[e.key]) {
      e.preventDefault();
      choose(k[e.key]);
    }
  });
  requestAnimationFrame(loop);
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js");
  // read-only hook for the end-to-end test
  (window as unknown as { lookspeak: unknown }).lookspeak = { stats, get text() { return typer.text; }, get tracker() { return tracker?.delegate ?? null; } };
}

main();
