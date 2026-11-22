// The language model in a real browser: loads in the worker, changes the predictions
// for a sentence, saves keypresses on it, and loads again with the network off.
// Downloads the 182 MB model on the first run (cached by Chrome afterwards).
import { start, sleep } from "./harness.mjs";

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed = true;
};

const SENTENCE = "i would like a cup of coffee";
const LM = process.env.LM_DEVICE ? `?lm=${process.env.LM_DEVICE}` : "";

async function open(browser, url, smart) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.evaluateOnNewDocument((smart) => {
    localStorage.setItem("lookspeak.v1", JSON.stringify({ mode: "keys", smart }));
  }, smart);
  await page.goto(url + LM);
  await page.waitForFunction(() => window.lookspeak);
  await page.click('[data-mode="keys"]');
  await page.waitForSelector("#board:not([hidden])");
  return page;
}

const ready = (page, timeout) => page.waitForFunction(() => window.lookspeak.lm?.state !== "loading", { timeout, polling: 500 });

// Picks one item by reading which half shows it, like a user would.
async function pick(page, kind, label) {
  const before = await page.evaluate(() => window.lookspeak.text);
  for (let presses = 1; presses < 20; presses++) {
    const side = await page.evaluate((kind, label) => {
      const has = (id) => [...document.querySelectorAll(`#${id} .items span.${kind}`)].some((s) => s.textContent === label);
      return has("left") ? "ArrowLeft" : has("right") ? "ArrowRight" : null;
    }, kind, label);
    if (!side) throw new Error(`"${label}" is on neither half`);
    await page.keyboard.press(side);
    if ((await page.evaluate(() => window.lookspeak.text)) !== before) return presses;
  }
  throw new Error(`could not select "${label}"`);
}

// Shortest route: the whole word when the board offers it, otherwise the next letter.
async function type(page, sentence, settle) {
  let presses = 0;
  for (const word of sentence.trim().split(" ")) {
    for (let i = 0; ; i++) {
      await sleep(settle); // give the model time to answer for the new context
      const offered = await page.evaluate(() => window.lookspeak.words);
      if (offered.includes(word)) { presses += await pick(page, "w", word); break; }
      if (i === word.length) { presses += await pick(page, "k", "␣ space"); break; }
      presses += await pick(page, "c", word[i]);
    }
  }
  return presses;
}

// localhost so the service worker registers; a kept profile so re-runs skip the download
const { url, browser, close } = await start({ host: "localhost", userDataDir: "node_modules/.cache/e2e-chrome" });
try {
  let page = await open(browser, url, true);
  const t0 = Date.now();
  await ready(page, 15 * 60_000);
  const lm = await page.evaluate(() => window.lookspeak.lm);
  check(lm.state === "ready", `model ${lm.state} (${lm.device}) in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${lm.message}`);

  const context = SENTENCE.split(" ").slice(0, -1).join(" ");
  await type(page, context, 400);
  await sleep(1500);
  const smartWords = await page.evaluate(() => window.lookspeak.words);
  check(smartWords.includes("coffee") || smartWords.includes("tea"), `after "${context}" the model offers: ${smartWords.join(", ")}`);
  const ms = await page.evaluate(() => window.lookspeak.lm.lastMs);
  check(ms > 0 && ms < 1300, `one prediction took ${ms.toFixed(0)} ms (must fit in one 1.3 s look)`);
  await page.close();

  const plainPage = await open(browser, url, false);
  await type(plainPage, context, 0);
  const plainWords = await plainPage.evaluate(() => window.lookspeak.words);
  check(!plainWords.includes("coffee"), `without the model it offers: ${plainWords.join(", ")}`);
  await plainPage.close();

  // whole sentence, both ways
  page = await open(browser, url, true);
  await ready(page, 120_000);
  const withLm = await type(page, SENTENCE, 400);
  const plainP = await open(browser, url, false);
  const plain = await type(plainP, SENTENCE, 0);
  await plainP.close();
  check(withLm < plain, `"${SENTENCE}": ${withLm} keypresses with the model, ${plain} without`);

  // offline: model, runtime and worker come from caches
  await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 30_000 });
  await sleep(2000);
  await page.setOfflineMode(true);
  await page.reload();
  await page.waitForFunction(() => window.lookspeak);
  await page.click('[data-mode="keys"]');
  await ready(page, 120_000);
  const off = await page.evaluate(() => window.lookspeak.lm);
  check(off.state === "ready", `offline reload: model ${off.state} (${off.device})`);
} catch (e) {
  check(false, e.stack ?? e.message);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
