// Records docs/scan.gif: one-switch mode typing a sentence. A frame is taken about
// every 120 ms of real time; frames where the switch was pressed are marked.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { start, sleep } from "./harness.mjs";

const SENTENCE = process.argv[2] ?? "i need water";
const STEP = 700;
const dir = "e2e/frames";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const { url, browser, close } = await start();
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 460 });
await page.evaluateOnNewDocument((step) => localStorage.setItem("lookspeak.v1", JSON.stringify({ mode: "scan", scanMs: step })), STEP);
await page.goto(url);
await page.waitForFunction(() => window.lookspeak);
await page.click('[data-mode="scan"]');
await page.waitForSelector("#board:not([hidden])");
await page.addStyleTag({ content: "footer{display:none}" });

const goal = SENTENCE + " ";
const frames = [];
let presses = 0;
const t0 = Date.now();
const shoot = async (pressed) => {
  const k = frames.length;
  await page.screenshot({ path: `${dir}/${String(k).padStart(3, "0")}.png` });
  frames.push({ t: Date.now() - t0, pressed, presses });
};
const want = async () => {
  const { text, words } = await page.evaluate(() => ({ text: window.lookspeak.text, words: window.lookspeak.words }));
  if (text === goal) return null;
  const s = text.lastIndexOf(" ") + 1;
  const word = goal.slice(s, goal.indexOf(" ", s));
  const prefix = text.slice(s);
  const id = words.includes(word) && prefix !== word ? "w:" + word : prefix === word ? "space" : "c:" + goal[text.length];
  return page.evaluate((id) => window.lookspeak.route(id), id);
};
await shoot(false);
for (let target = await want(); target; target = await want()) {
  if ((await page.evaluate(() => window.lookspeak.lit)) === target) {
    await page.keyboard.press("Space");
    presses++;
    await shoot(true);
  } else {
    await shoot(false);
    await sleep(60);
  }
}
for (let i = 0; i < 4; i++) await shoot(false);
await close();
writeFileSync(`${dir}/meta.json`, JSON.stringify({ sentence: SENTENCE, step: STEP, frames }));
console.log(`"${SENTENCE}": ${presses} presses in ${(frames.at(-1).t / 1000).toFixed(1)} s at ${STEP} ms per step`);
execFileSync("python3", ["e2e/compose_scan.py", dir, "docs/scan.gif"], { stdio: "inherit" });
