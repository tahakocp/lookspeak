import { leaves, isLeaf, pathTo, type Item } from "./huffman.ts";
import { Lexicon } from "./lexicon.ts";
import { Typer, type Choice } from "./typer.ts";
import { LANGUAGES, language } from "./languages.ts";
import { calibrate, Classifier, defaultCalibration, TARGETS, type Dir, type Features, type Target } from "./gaze.ts";
import { Dwell } from "./dwell.ts";
import { FaceTracker } from "./camera.ts";
import { load, save, type Settings } from "./settings.ts";
import { loadLearner, saveLearner } from "./learn.ts";
import { SmartPredictions } from "./smart.ts";
import { BlinkSwitch, Scanner } from "./scan.ts";
import { applyProfile, exportProfile, readProfile } from "./profile.ts";
import type { Device } from "./lm.ts";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const screens = ["start", "calib", "board"] as const;
function show(id: (typeof screens)[number]) {
  for (const s of screens) $("#" + s).hidden = s !== id;
}

const settings: Settings = load();
let typer: Typer;
let lex: Lexicon;
let smart: SmartPredictions | null = null;
let tracker: FaceTracker | null = null;
let classifier: Classifier | null = null;
const dwell = new Dwell(settings.dwellMs);
const scanner = new Scanner(settings.scanMs);
const blinkSwitch = new BlinkSwitch();
let onFrame: ((f: Features | null, t: number) => void) | null = null;
const stats = { frames: 0, faces: 0, fired: 0, since: performance.now(), fps: 0, lastDir: "none" as Dir, choices: [] as Choice[], chimes: 0 };

// ---------- speech ----------
function voices() {
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(settings.lang));
}
function say(text: string) {
  if (!text || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  // French and Italian elisions are separate words on the board ("l'" + "homme")
  if (settings.lang === "fr" || settings.lang === "it") text = text.replace(/' /g, "'");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = settings.lang;
  const v = voices().find((x) => x.name === settings.voice);
  if (v) u.voice = v;
  u.rate = settings.rate;
  speechSynthesis.speak(u);
}

// Three rising beeps, loud enough to be heard from the next room.
let audio: AudioContext | null = null;
function chime() {
  audio ??= new AudioContext();
  const t0 = audio.currentTime + 0.05;
  [660, 880, 1100].forEach((hz, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.frequency.value = hz;
    const t = t0 + i * 0.35;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(audio!.destination);
    o.start(t);
    o.stop(t + 0.32);
  });
  stats.chimes++;
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
  if (ev.kind === "chime") {
    chime();
    $("#status").textContent = "chime played";
    if (typer.learner) saveLearner(typer.learner);
  }
  if (ev.kind === "spoke") {
    say(ev.text);
    smart?.spoke(ev.text);
    $("#status").textContent = `said: "${ev.text}"`;
    if (typer.learner) saveLearner(typer.learner);
  }
  render();
}

// A click or key: in one-switch mode any of them means "the lit zone".
function pick(c: Choice) {
  if (settings.mode === "scan") choose(scanner.press(performance.now()));
  else choose(c);
}

function paintScan(t: number) {
  const lit = scanner.current(t);
  for (const z of ["left", "right", "up"] as const) {
    const el = $("#" + z);
    el.classList.toggle("active", lit === z);
    el.style.setProperty("--p", lit === z ? String(scanner.progress(t)) : "0");
  }
}

function scanFrame(f: Features | null, t: number) {
  paintScan(t);
  if (!settings.blinkSelect || !tracker) return;
  const closed = blinkSwitch.closedFor(t);
  $("#gaze").textContent = closed > 150 ? `eyes closed ${(closed / 1000).toFixed(1)} s` : f ? "eyes open" : "no face";
  if (blinkSwitch.update(f ? f.blink : null, t)) choose(scanner.press(t));
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

const GAZE_LABEL: Record<Dir, string> = { left: "◀ left", right: "right ▶", up: "▲ up", center: "● center", none: "– eyes closed or no face" };

function boardFrame(f: Features | null, t: number) {
  if (!classifier) return;
  const d = classifier.classify(f);
  if (d !== stats.lastDir) $("#gaze").textContent = GAZE_LABEL[d];
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
const MIN_SAMPLES = 16, MAX_STEP_MS = 10000;

function runCalibration(): Promise<void> {
  show("calib");
  const dot = $("#dot");
  const msg = $("#calib-msg");
  const samples = Object.fromEntries(TARGETS.map((t) => [t, [] as Features[]])) as Record<Target, Features[]>;
  const plan: Target[] = ["center", "left", "center", "right", "center", "up", "center"];
  const stepSamples: Features[][] = [];
  return new Promise((resolve) => {
    let i = -1, stepStart = 0;
    const next = (t: number) => {
      i++;
      if (i >= plan.length) {
        onFrame = null;
        // keep the later half of each step: the eyes have settled by then
        plan.forEach((target, k) => {
          const xs = stepSamples[k] ?? [];
          samples[target].push(...xs.slice(Math.floor(xs.length / 2)));
        });
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
      if (f && t - stepStart > SKIP_MS) (stepSamples[i] ??= []).push(f);
      // slow machines may process only a few frames per second: hold the dot until
      // enough samples arrived so the median is not taken over stale frames
      const enough = (stepSamples[i]?.length ?? 0) >= MIN_SAMPLES || t - stepStart > MAX_STEP_MS;
      if (t - stepStart > STEP_MS && enough) next(t);
    };
  });
}

// ---------- start ----------
async function startBoard() {
  show("board");
  render();
  if (settings.mode === "scan") {
    $("#cam").classList.toggle("off", !settings.blinkSelect);
    scanner.stepMs = settings.scanMs;
    scanner.restart(performance.now());
    $("#gaze").textContent = "";
    $("#status").textContent = settings.blinkSelect
      ? "one switch: a long blink, Space, Enter or a click picks the lit zone"
      : "one switch: Space, Enter or a click picks the lit zone";
    onFrame = scanFrame;
    return;
  }
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

async function ensureTracker(): Promise<boolean> {
  if (tracker) return true;
  $("#start-status").textContent = "Loading the face model (3.7 MB, cached after the first visit)...";
  try {
    tracker = await FaceTracker.create($<HTMLVideoElement>("#cam"));
    return true;
  } catch (e) {
    $("#start-status").textContent = `Camera or model failed: ${(e as Error).message}. Switch keys still work.`;
    settings.blinkSelect = false;
    return false;
  }
}

async function begin(mode: Settings["mode"]) {
  settings.mode = mode;
  save(settings);
  if (mode === "scan" && settings.blinkSelect) await ensureTracker();
  if (mode !== "keys" && mode !== "scan") {
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

// ---------- language model ----------
const ENGLISH_ONLY = "Only available for English: the model was trained almost only on English text.";
const SIZE_NOTE = "Downloads a 117-182 MB language model once (from huggingface.co) and runs it on this device. What you type is never sent anywhere.";
function smartNote(): string {
  if (settings.lang !== "en") return ENGLISH_ONLY;
  if (!smart) return SIZE_NOTE;
  if (smart.state === "failed") return `The language model could not load (${smart.message}). Word frequencies are used instead.`;
  if (smart.state === "loading") return `Loading the language model${smart.message ? `: ${smart.message}` : "..."}`;
  return `Language model on (${smart.device}, ${smart.message}${smart.lastMs ? `, last answer ${Math.round(smart.lastMs)} ms` : ""}).`;
}
function setSmart(on: boolean) {
  on &&= settings.lang === "en";
  if (on && !smart) {
    const force = new URLSearchParams(location.search).get("lm") as Device | null;
    smart = new SmartPredictions(lex.words, lex.frequencies, force ?? undefined);
    smart.onUpdate = () => {
      if (typer.refresh()) render();
    };
    smart.onStatus = () => {
      $("#smart-note").textContent = smartNote();
    };
  } else if (!on && smart) {
    smart.stop();
    smart = null;
  }
  typer.context = smart;
  typer.refresh();
}

// ---------- settings dialog ----------
function openSettings() {
  const dlg = $<HTMLDialogElement>("#settings");
  dlg.returnValue = "";
  const bind = (id: string, key: "dwellMs" | "sensitivity" | "rate" | "scanMs", fmt: (v: number) => string) => {
    const inp = $<HTMLInputElement>("#" + id);
    const out = $("#" + id.replace(/^(dwell|sens|rate|scan).*/, "$1") + "-out");
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
  bind("scan", "scanMs", (v) => `${(v / 1000).toFixed(1)} s`);
  const blinkBox = $<HTMLInputElement>("#blink");
  blinkBox.checked = settings.blinkSelect;
  const sel = $<HTMLSelectElement>("#voice");
  sel.replaceChildren(new Option("system default", ""), ...voices().map((v) => new Option(v.name, v.name, false, v.name === settings.voice)));
  const ta = $<HTMLTextAreaElement>("#phrases");
  ta.value = typer.phrases.join("\n");
  const memory = $("#memory");
  const rememberLabel = () => {
    const n = typer.learner?.size ?? 0;
    const p = typer.learner?.phrases.size ?? 0;
    if (!n && !p) return "No words remembered yet. After you speak a few sentences, names and repeated phrases will need fewer looks. They stay on this device.";
    const bits = [n ? `${n} word${n === 1 ? "" : "s"}` : "", p ? `${p} quick phrase${p === 1 ? "" : "s"}` : ""].filter(Boolean);
    return `Remembered ${bits.join(" and ")} on this device. Nothing is uploaded.`;
  };
  memory.textContent = rememberLabel();
  const smartBox = $<HTMLInputElement>("#smart");
  smartBox.checked = settings.smart && settings.lang === "en";
  smartBox.disabled = settings.lang !== "en";
  const langSel = $<HTMLSelectElement>("#lang");
  fillLanguages(langSel);
  langSel.onchange = async () => {
    await setLanguage(langSel.value);
    smartBox.checked = settings.smart && settings.lang === "en";
    smartBox.disabled = settings.lang !== "en";
    $("#smart-note").textContent = smartNote();
    sel.replaceChildren(new Option("system default", ""), ...voices().map((v) => new Option(v.name, v.name)));
    ta.value = typer.phrases.join("\n");
  };
  $("#smart-note").textContent = smartNote();
  smartBox.onchange = () => {
    settings.smart = smartBox.checked;
    save(settings);
    setSmart(settings.smart);
    $("#smart-note").textContent = smartNote();
  };
  const profileNote = $("#profile-note");
  profileNote.textContent = "";
  $("#export").onclick = () => {
    const p = exportProfile(settings, typer.learner ?? loadLearner());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 1)], { type: "application/json" }));
    a.download = `lookspeak-profile-${p.saved.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    profileNote.textContent = "Saved. The file contains the remembered words; keep it private.";
  };
  const file = $<HTMLInputElement>("#import-file");
  $("#import").onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    try {
      const p = readProfile(await f.text());
      const oldLang = settings.lang;
      const learner = applyProfile(p, settings, typer.learner ?? loadLearner());
      saveLearner(learner);
      typer.learner = learner;
      const lang = settings.lang;
      settings.lang = oldLang;
      save(settings);
      await setLanguage(lang);
      typer.phrases = settings.phrases ?? language(settings.lang).phrases;
      setSmart(settings.smart);
      dlg.close("profile");
      // the profile may use another input mode: pick it again on the start screen
      onFrame = null;
      show("start");
      $("#start-status").textContent = `Profile from ${p.saved.slice(0, 10) || "an unknown date"} loaded.`;
    } catch (e) {
      profileNote.textContent = (e as Error).message;
    }
  };
  $("#forget").onclick = () => {
    typer.learner?.clear();
    if (typer.learner) saveLearner(typer.learner);
    memory.textContent = rememberLabel();
  };
  dlg.onclose = async () => {
    if (dlg.returnValue === "profile") return; // fields still show the old values
    settings.voice = sel.value;
    const blinkChanged = blinkBox.checked !== settings.blinkSelect;
    settings.blinkSelect = blinkBox.checked;
    const lines = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
    settings.phrases = lines.length ? lines : null;
    typer.phrases = settings.phrases ?? language(settings.lang).phrases;
    save(settings);
    dwell.dwellMs = settings.dwellMs;
    if (classifier) classifier.sensitivity = settings.sensitivity;
    scanner.stepMs = settings.scanMs;
    if (dlg.returnValue === "mode") {
      onFrame = null;
      show("start");
      return;
    }
    if (settings.mode === "scan" && blinkChanged) {
      if (settings.blinkSelect) await ensureTracker();
      save(settings);
      await startBoard();
    }
    render();
  };
  dlg.showModal();
}

// ---------- languages ----------
function fillLanguages(sel: HTMLSelectElement) {
  sel.replaceChildren(...LANGUAGES.map((l) => new Option(l.name, l.code, false, l.code === settings.lang)));
}

async function loadLanguage(learner = typer?.learner ?? null) {
  const L = language(settings.lang);
  lex = Lexicon.parse(await (await fetch(L.words)).text(), [...L.letters]);
  typer = new Typer(lex, { predictions: 4, layout: "huffman" }, learner);
  typer.phrases = settings.phrases ?? L.phrases;
  $("#board").lang = L.code;
}

async function setLanguage(code: string) {
  if (code === settings.lang) return;
  // a custom phrase list was written for the old language
  if (settings.phrases && settings.phrases.join("\n") === language(settings.lang).phrases.join("\n")) settings.phrases = null;
  settings.lang = language(code).code;
  settings.voice = ""; // voices are per language
  save(settings);
  setSmart(false);
  await loadLanguage();
  if (settings.smart) setSmart(true);
  for (const id of ["#lang", "#lang-start"]) $<HTMLSelectElement>(id).value = settings.lang;
  render();
}

async function main() {
  await loadLanguage(loadLearner());
  if (settings.smart) setSmart(true);
  const startSel = $<HTMLSelectElement>("#lang-start");
  fillLanguages(startSel);
  startSel.onchange = () => setLanguage(startSel.value);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) b.onclick = () => begin(b.dataset.mode as Settings["mode"]);
  $("#left").onclick = () => pick("left");
  $("#right").onclick = () => pick("right");
  $("#up").onclick = () => pick("up");
  $("#output").onclick = () => settings.mode === "scan" && pick("up");
  $("#menu").onclick = openSettings;
  $("#recal").onclick = async () => {
    if (settings.mode === "keys" || settings.mode === "scan") return;
    await runCalibration();
    await startBoard();
  };
  addEventListener("keydown", (e) => {
    if ($("#board").hidden || $<HTMLDialogElement>("#settings").open) return;
    if (settings.mode === "scan" && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      if (!e.repeat) pick("left");
      return;
    }
    const k: Record<string, Choice> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", "1": "left", "2": "right", Backspace: "up" };
    if (k[e.key]) {
      e.preventDefault();
      choose(k[e.key]);
    }
  });
  requestAnimationFrame(loop);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js");
  // read-only hook for the end-to-end test
  (window as unknown as { lookspeak: unknown }).lookspeak = {
    stats,
    get text() { return typer.text; },
    get tracker() { return tracker?.delegate ?? null; },
    get lm() { return smart && { state: smart.state, device: smart.device, message: smart.message, lastMs: smart.lastMs }; },
    get lit() { return settings.mode === "scan" ? scanner.current(performance.now()) : null; },
    route(id: string) { return pathTo(typer.node, id)?.[0] ?? "up"; },
    get words() { return typer.items().filter((i) => i.id.startsWith("w:")).map((i) => i.label); },
  };
}

main();
