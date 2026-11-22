// Records docs/context.gif: the same sentence typed on two boards side by side, one
// look per frame. Left uses word frequencies only, right adds the language model.
// Selections are made with the arrow keys (the same choices a gaze would make).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { start, sleep } from "./harness.mjs";

const SENTENCE = process.argv[2] ?? "i would like a cup of coffee";
const goal = SENTENCE + " ";
const dir = "e2e/frames";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const { url, browser, close } = await start({ host: "localhost", userDataDir: "node_modules/.cache/e2e-chrome" });
async function open(smart) {
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 460 });
  await page.evaluateOnNewDocument((smart) => localStorage.setItem("lookspeak.v1", JSON.stringify({ mode: "keys", smart })), smart);
  await page.goto(url);
  await page.waitForFunction(() => window.lookspeak);
  await page.click('[data-mode="keys"]');
  await page.waitForSelector("#board:not([hidden])");
  await page.addStyleTag({ content: "footer{display:none}" });
  return page;
}

// One arrow press towards the next item: the whole word if offered, else the next letter.
async function step(page) {
  const { text, words } = await page.evaluate(() => ({ text: window.lookspeak.text, words: window.lookspeak.words }));
  if (text === goal) return false;
  const start = text.lastIndexOf(" ") + 1;
  const word = goal.slice(start, goal.indexOf(" ", start));
  const prefix = text.slice(start);
  const [kind, label] = words.includes(word) && prefix !== word ? ["w", word] : prefix === word ? ["k", "␣ space"] : ["c", goal[text.length]];
  const side = await page.evaluate((kind, label) => {
    const has = (id) => [...document.querySelectorAll(`#${id} .items span.${kind}`)].some((s) => s.textContent === label);
    return has("left") ? "ArrowLeft" : has("right") ? "ArrowRight" : null;
  }, kind, label);
  if (!side) throw new Error(`"${label}" not on the board`);
  await page.keyboard.press(side);
  if ((await page.evaluate(() => window.lookspeak.text)) !== text) await sleep(500); // let the model answer
  return true;
}

const plain = await open(false);
const smart = await open(true);
await smart.waitForFunction(() => window.lookspeak.lm?.state === "ready", { timeout: 15 * 60_000, polling: 500 });
await sleep(1000);
const counts = [0, 0];
const done = [false, false];
let frame = 0;
const meta = [];
const shoot = async () => {
  for (const [i, p] of [plain, smart].entries()) await p.screenshot({ path: `${dir}/${String(frame).padStart(3, "0")}-${i}.png` });
  meta.push([...counts]);
  frame++;
};
await shoot();
while (!done[0] || !done[1]) {
  for (const [i, p] of [plain, smart].entries()) {
    if (done[i]) continue;
    if (await step(p)) counts[i]++;
    else done[i] = true;
  }
  await shoot();
}
await close();
writeFileSync(`${dir}/meta.json`, JSON.stringify({ sentence: SENTENCE, counts: meta }));
console.log(`looks: word list ${counts[0]}, with model ${counts[1]}`);
execFileSync("python3", ["e2e/compose_gif.py", dir, "docs/context.gif"], { stdio: "inherit" });
