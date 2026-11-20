// End-to-end run in headless Chrome with the real MediaPipe model.
// The webcam is replaced by a canvas stream that shows one of four still photos
// (fixtures/: a public-domain portrait with the irises moved digitally), so the test
// controls exactly where the "user" looks. It calibrates through the real UI, then types
// by gaze and checks the result against the same choices made with arrow keys.
import puppeteer from "puppeteer-core";
import { readFileSync, existsSync } from "node:fs";
import { serve } from "../scripts/serve.mjs";
import { Lexicon } from "../src/lexicon.ts";
import { Typer } from "../src/typer.ts";
import { pathTo } from "../src/huffman.ts";

const chrome = process.env.CHROME ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
const fixtures = Object.fromEntries(
  ["center", "look-left", "look-right", "look-up"].map((n) => [n, "data:image/jpeg;base64," + readFileSync(new URL(`fixtures/${n}.jpg`, import.meta.url)).toString("base64")]),
);

const srv = await serve("dist");
const url = `http://127.0.0.1:${srv.address().port}/`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed = true;
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.evaluateOnNewDocument((fx) => {
    const imgs = {};
    for (const [k, v] of Object.entries(fx)) { const i = new Image(); i.src = v; imgs[k] = i; }
    let current = "center";
    window.__look = (k) => { current = k; };
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 640; c.height = 480;
      const g = c.getContext("2d");
      const draw = () => { if (imgs[current].complete) g.drawImage(imgs[current], 0, 0); requestAnimationFrame(draw); };
      draw();
      return c.captureStream(30);
    };
  }, fixtures);

  await page.goto(url);
  await page.waitForFunction(() => window.lookspeak);
  const t0 = Date.now();
  await page.click('[data-mode="eyes"]');
  await page.waitForSelector("#calib:not([hidden])", { timeout: 60000 });
  check(true, `model + camera ready in ${Date.now() - t0} ms`);

  // follow the calibration dot: the message names the target
  while (await page.$eval("#calib", (e) => !e.hidden)) {
    const msg = await page.$eval("#calib-msg", (e) => e.textContent);
    const target = /left/.test(msg) ? "look-left" : /right/.test(msg) ? "look-right" : /top/.test(msg) ? "look-up" : "center";
    await page.evaluate((t) => window.__look(t), target);
    if (/try again/.test(msg)) throw new Error("calibration rejected: " + msg);
    await sleep(100);
  }
  check(await page.$eval("#board", (e) => !e.hidden), "calibration accepted, board shown");

  const st = await page.evaluate(() => ({ ...window.lookspeak.stats, delegate: window.lookspeak.tracker }));
  check(st.fps > 5, `face tracking at ${st.fps.toFixed(1)} fps (${st.delegate})`);

  // type by gaze: each look is held 1.3 s, then back to center for 0.6 s
  // plan the looks for "hi", then one "up" to undo the i
  const sim = new Typer(Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8")));
  const plan = [];
  for (const id of ["c:h", "c:i"]) for (const c of pathTo(sim.node, id)) { plan.push(c); sim.choose(c); }
  plan.push("up");
  sim.choose("up");
  for (const d of plan) {
    await page.evaluate((t) => window.__look(t), d === "up" ? "look-up" : `look-${d}`);
    await sleep(1300);
    await page.evaluate(() => window.__look("center"));
    await sleep(600);
  }
  const gaze = await page.evaluate(() => ({ text: window.lookspeak.text, fired: window.lookspeak.stats.fired, choices: window.lookspeak.stats.choices.join(",") }));
  check(gaze.choices === plan.join(","), `gaze choices ${gaze.choices}`);
  check(gaze.fired === plan.length, `${gaze.fired}/${plan.length} looks fired, no extra selections`);
  await page.screenshot({ path: "e2e/last-run.png" });

  // same choices with the keyboard in a fresh page
  const keys = await browser.newPage();
  await keys.goto(url);
  await keys.waitForFunction(() => window.lookspeak);
  await keys.click('[data-mode="keys"]');
  await keys.waitForSelector("#board:not([hidden])");
  for (const d of plan) await keys.keyboard.press(d === "left" ? "ArrowLeft" : d === "right" ? "ArrowRight" : "ArrowUp");
  const keyText = await keys.evaluate(() => window.lookspeak.text);

  check(gaze.text === sim.text && sim.text === "h", `gaze typed ${JSON.stringify(gaze.text)}, expected "h"`);
  check(gaze.text === keyText, `gaze text ${JSON.stringify(gaze.text)} equals key text ${JSON.stringify(keyText)}`);
} catch (e) {
  check(false, e.message);
} finally {
  await browser.close();
  srv.close();
}
process.exit(failed ? 1 : 0);
