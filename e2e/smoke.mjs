// End-to-end: real MediaPipe model in headless Chrome, calibration through the UI,
// typing by gaze, and the result compared with the same choices made by keyboard.
import { readFileSync } from "node:fs";
import { start, gazePage, calibrate, look, sleep } from "./harness.mjs";
import { Lexicon } from "../src/lexicon.ts";
import { Typer } from "../src/typer.ts";
import { pathTo } from "../src/huffman.ts";

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed = true;
};

const { url, browser, close } = await start();
try {
  const page = await gazePage(browser, url);
  const t0 = Date.now();
  await page.click('[data-mode="eyes"]');
  await page.waitForSelector("#calib:not([hidden])", { timeout: 60000 });
  check(true, `model + camera ready in ${Date.now() - t0} ms`);
  await calibrate(page);
  check(await page.$eval("#board", (e) => !e.hidden), "calibration accepted, board shown");
  const st = await page.evaluate(() => ({ ...window.lookspeak.stats, delegate: window.lookspeak.tracker }));
  check(st.fps > 2, `face tracking at ${st.fps.toFixed(1)} fps (${st.delegate})`);

  // looks for "hi", then one "up" to undo the i
  const sim = new Typer(Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8")));
  const plan = [];
  for (const id of ["c:h", "c:i"]) for (const c of pathTo(sim.node, id)) { plan.push(c); sim.choose(c); }
  plan.push("up");
  sim.choose("up");

  for (const d of plan) {
    await look(page, d);
    await sleep(1300); // default dwell is 800 ms
    await look(page, "center");
    await sleep(600);
  }
  const gaze = await page.evaluate(() => ({ text: window.lookspeak.text, fired: window.lookspeak.stats.fired, choices: window.lookspeak.stats.choices.join(",") }));
  check(gaze.choices === plan.join(","), `gaze choices ${gaze.choices}`);
  check(gaze.fired === plan.length, `${gaze.fired}/${plan.length} looks fired, no extra selections`);
  check(gaze.text === "h" && sim.text === "h", `gaze typed ${JSON.stringify(gaze.text)}, expected "h"`);
  await page.screenshot({ path: "e2e/last-run.png" });

  // a glance shorter than the dwell must not select anything
  await look(page, "left");
  await sleep(350);
  await look(page, "center");
  await sleep(800);
  check((await page.evaluate(() => window.lookspeak.stats.fired)) === plan.length, "350 ms glance did not fire");

  const keys = await browser.newPage();
  await keys.goto(url);
  await keys.waitForFunction(() => window.lookspeak);
  await keys.click('[data-mode="keys"]');
  await keys.waitForSelector("#board:not([hidden])");
  for (const d of plan) await keys.keyboard.press(d === "left" ? "ArrowLeft" : d === "right" ? "ArrowRight" : "ArrowUp");
  const keyText = await keys.evaluate(() => window.lookspeak.text);
  check(gaze.text === keyText, `keyboard path gives the same text ${JSON.stringify(keyText)}`);
} catch (e) {
  check(false, e.message);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
