// Records docs/demo.gif: types a sentence by simulated gaze and speaks it.
// Uses a faster dwell (500 ms) than the default so the GIF stays short.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { start, gazePage, calibrate, look, sleep } from "./harness.mjs";
import { Lexicon } from "../src/lexicon.ts";
import { typeSentence } from "../src/simulate.ts";

const SENTENCE = process.argv[2] ?? "i need water";
const lex = Lexicon.parse(readFileSync(new URL("../data/words.txt", import.meta.url), "utf8"));
const plan = typeSentence(lex, SENTENCE).choices;

const { url, browser, close } = await start();
const page = await gazePage(browser, url, { width: 960, height: 540, settings: { mode: "eyes", dwellMs: 500, sensitivity: 0.5, rate: 1, voice: "", calibration: null, phrases: null } });
// the photo is only a test input; keep it off the recording
await page.addStyleTag({ content: "#cam{display:none}" });
await page.click('[data-mode="eyes"]');
await page.waitForSelector("#calib:not([hidden])", { timeout: 60000 });
await calibrate(page);

const rec = await page.screencast({ path: "e2e/demo.webm" });
await sleep(600);
for (const d of [...plan, ...speakPath()]) {
  await look(page, d);
  await sleep(850);
  await look(page, "center");
  await sleep(500);
}
await sleep(1500);
await rec.stop();
const said = await page.$eval("#status", (e) => e.textContent);
const choices = await page.evaluate(() => window.lookspeak.stats.choices.length);
console.log("fps", await page.evaluate(() => window.lookspeak.stats.fps), "fired", await page.evaluate(() => window.lookspeak.stats.choices.join(",")));
console.log("plan ", [...plan, ...speakPath()].join(","));
console.log(`${choices} looks fired (planned ${plan.length + speakPath().length}), status ${JSON.stringify(said)}`);
await close();
if (said !== `said: "${SENTENCE}"`) throw new Error("demo run did not type the sentence");

function speakPath() {
  // simulate() stops once the text is typed; find the route to "speak" from that state
  return JSON.parse(execFileSync(process.execPath, ["e2e/speak-path.ts", SENTENCE], { encoding: "utf8" }));
}

mkdirSync("docs", { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "e2e/demo.webm",
  "-vf", "setpts=PTS/2,fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none", "-loop", "0", "docs/demo.gif"]);
console.log("wrote docs/demo.gif");
