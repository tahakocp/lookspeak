// Shared setup for the browser tests: headless Chrome with the webcam replaced by a
// canvas stream that shows one of four still photos, so a test decides where the
// "user" looks. fixtures/ holds a public-domain NASA portrait whose irises were moved
// digitally (make_fixtures.py); MediaPipe reads them as looking left, right, up.
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "node:fs";
import { serve } from "../scripts/serve.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = process.env.CHROME ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
const fixtures = Object.fromEntries(
  ["center", "look-left", "look-right", "look-up"].map((n) => [n, "data:image/jpeg;base64," + readFileSync(new URL(`fixtures/${n}.jpg`, import.meta.url)).toString("base64")]),
);

export async function start() {
  const srv = await serve("dist");
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
  return { url, browser, close: async () => { await browser.close(); srv.close(); } };
}

export async function gazePage(browser, url, { width = 1280, height = 720, settings } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.evaluateOnNewDocument((fx, settings) => {
    if (settings) localStorage.setItem("lookspeak.v1", JSON.stringify(settings));
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
  }, fixtures, settings ?? null);
  // E2E_THROTTLE=6 makes the page roughly as slow as an old laptop
  if (process.env.E2E_THROTTLE) await page.emulateCPUThrottling(Number(process.env.E2E_THROTTLE));
  await page.goto(url);
  await page.waitForFunction(() => window.lookspeak);
  return page;
}

export const look = (page, d) => page.evaluate((t) => window.__look(t), d === "center" ? "center" : `look-${d}`);

// Follows the calibration dot by reading its instruction text.
export async function calibrate(page) {
  while (await page.$eval("#calib", (e) => !e.hidden)) {
    const msg = await page.$eval("#calib-msg", (e) => e.textContent);
    if (/try again/.test(msg)) throw new Error("calibration rejected: " + msg);
    await look(page, /left/.test(msg) ? "left" : /right/.test(msg) ? "right" : /top/.test(msg) ? "up" : "center");
    await sleep(100);
  }
}
