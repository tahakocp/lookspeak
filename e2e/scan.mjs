// One-switch mode in headless Chrome: the zones light up in turn and a single key
// (Space) picks the lit one. Types "hi " by waiting for the right zone each time.
import { start, sleep } from "./harness.mjs";

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed = true;
};

const STEP = 400;
const { url, browser, close } = await start();
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => check(false, "pageerror: " + e.message));
  await page.evaluateOnNewDocument((step) => localStorage.setItem("lookspeak.v1", JSON.stringify({ mode: "scan", scanMs: step })), STEP);
  await page.goto(url);
  await page.waitForFunction(() => window.lookspeak);
  await page.click('[data-mode="scan"]');
  await page.waitForSelector("#board:not([hidden])");

  const lit = () => page.evaluate(() => window.lookspeak.lit);
  const seen = [];
  for (let i = 0; i < 24; i++) {
    const z = await lit();
    if (seen[seen.length - 1] !== z) seen.push(z);
    await sleep(150);
  }
  check(seen.join(",").startsWith("left,right,up,left"), `zones lit in turn: ${seen.join(", ")}`);
  const cls = await page.$eval("#left", (e) => e.classList.contains("active")) || await page.$eval("#right", (e) => e.classList.contains("active")) || await page.$eval("#up", (e) => e.classList.contains("active"));
  check(cls, "lit zone is highlighted on screen");

  let presses = 0;
  const t0 = Date.now();
  for (const id of ["c:h", "c:i", "space"]) {
    const before = await page.evaluate(() => window.lookspeak.text);
    for (let n = 0; n < 12 && (await page.evaluate(() => window.lookspeak.text)) === before; n++) {
      const want = await page.evaluate((id) => window.lookspeak.route(id), id);
      await page.waitForFunction((w) => window.lookspeak.lit === w, { timeout: 10_000, polling: 20 }, want);
      await page.keyboard.press("Space");
      presses++;
    }
  }
  const text = await page.evaluate(() => window.lookspeak.text);
  check(text === "hi ", `typed ${JSON.stringify(text)} with ${presses} presses of one key in ${((Date.now() - t0) / 1000).toFixed(1)} s (${STEP} ms steps)`);

  // a click anywhere on the board is the same switch
  await page.waitForFunction(() => window.lookspeak.lit === "up", { timeout: 10_000, polling: 20 });
  await page.click("#left");
  const after = await page.evaluate(() => window.lookspeak.text);
  check(after === "hi", `a click while "up" is lit undoes: ${JSON.stringify(after)}`);
} catch (e) {
  check(false, e.stack ?? e.message);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
