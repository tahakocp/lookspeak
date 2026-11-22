// Carer features in headless Chrome: a profile file saved on one "computer" and
// loaded on another (a fresh browser profile), and the chime in quick phrases.
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start } from "./harness.mjs";

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed = true;
};

const dir = mkdtempSync(join(tmpdir(), "lookspeak-"));
async function board(browser, url, settings) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => check(false, "pageerror: " + e.message));
  if (settings) await page.evaluateOnNewDocument((s) => localStorage.setItem("lookspeak.v1", JSON.stringify(s)), settings);
  await page.goto(url);
  await page.waitForFunction(() => window.lookspeak);
  await page.click('[data-mode="keys"]');
  await page.waitForSelector("#board:not([hidden])");
  return page;
}

let s1 = await start();
try {
  const page = await board(s1.browser, s1.url, { mode: "keys", lang: "es", dwellMs: 1500, phrases: ["hola", "llama a Ana"] });
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  await page.click("#menu");
  await page.click("#export");
  let file = "";
  for (let i = 0; i < 50 && !file; i++) {
    await new Promise((r) => setTimeout(r, 100));
    file = readdirSync(dir).find((f) => f.endsWith(".json")) ?? "";
  }
  const saved = JSON.parse(readFileSync(join(dir, file), "utf8"));
  check(saved.settings.lang === "es" && saved.settings.dwellMs === 1500 && !("calibration" in saved.settings), `saved ${file}: lang ${saved.settings.lang}, dwell ${saved.settings.dwellMs} ms, no calibration`);

  // chime: open quick phrases, pick the chime with arrow keys
  await page.keyboard.press("Escape");
  const pickId = async (id) => {
    for (let i = 0; i < 20; i++) {
      const c = await page.evaluate((id) => window.lookspeak.route(id), id);
      if (c === "up") return;
      await page.keyboard.press(c === "left" ? "ArrowLeft" : "ArrowRight");
      if (id === "phrases" && (await page.$$eval(".items span", (e) => e.some((x) => x.textContent === "hola")))) return;
    }
  };
  await pickId("phrases");
  await pickId("chime");
  const chimes = await page.evaluate(() => window.lookspeak.stats.chimes);
  check(chimes === 1, `chime played ${chimes} time(s), text still ${JSON.stringify(await page.evaluate(() => window.lookspeak.text))}`);
  await s1.close();
  s1 = null;

  // another computer: fresh browser profile, English defaults, load the file
  const s2 = await start();
  try {
    const p2 = await board(s2.browser, s2.url, null);
    const before = await p2.evaluate(() => window.lookspeak.words);
    await p2.click("#menu");
    const input = await p2.$("#import-file");
    await input.uploadFile(join(dir, file));
    await p2.waitForSelector("#start:not([hidden])");
    const status = await p2.$eval("#start-status", (e) => e.textContent);
    await p2.click('[data-mode="keys"]');
    await p2.waitForSelector("#board:not([hidden])");
    const after = await p2.evaluate(() => window.lookspeak.words);
    check(/loaded/.test(status) && after.join() !== before.join(), `"${status}" words before: ${before.join(", ")}; after: ${after.join(", ")}`);
  } finally {
    await s2.close();
  }
} catch (e) {
  check(false, e.stack ?? e.message);
} finally {
  if (s1) await s1.close();
}
process.exit(failed ? 1 : 0);
