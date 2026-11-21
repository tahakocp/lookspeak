# lookspeak

Type and speak with your eyes using the webcam you already have. It runs in the browser, works offline after the first visit, and no video leaves your device.

**Try it: https://tahakocp.github.io/lookspeak/** (Chrome, Edge or Firefox on a laptop or desktop with a webcam)

![lookspeak typing "i need water" by gaze, then speaking it](docs/demo.gif)

<sub>Recorded in headless Chrome at 2x speed. The "user" is a test photo with digitally moved irises (see [How it is tested](#how-it-is-tested)), hidden from the recording.</sub>

lookspeak is for people who cannot speak or type with their hands, such as people with ALS/MND, cerebral palsy, locked-in syndrome or after a stroke, and for the family and carers who set it up. Speech-generating devices typically cost [around $15,000](https://alsnetwork.org/understanding-als/living-with-als/guides-for-daily-living/als-communication-devices/) and need a speech therapist's evaluation plus insurance authorization before they arrive. lookspeak is not a replacement for a properly fitted device, but it costs nothing and can be running in two minutes while you wait for one.

## How it works

The screen has two halves. Look at the half that holds your next letter or word and hold your gaze for 0.8 seconds. That half splits again, until one item is left. Look up to go back one step or undo.

Webcam eye tracking is too coarse to aim at small keys, so lookspeak only asks for three clear movements: left, right and up. The halves are not alphabetical. They are built as a Huffman tree over what you are likely to type next, using English word frequencies, so common letters and whole words take one or two looks while a rare letter takes six or seven.

| board (MacKenzie phrase set, 500 phrases, 14,809 characters) | looks per character | words / min at 0.8 s dwell |
|---|---|---|
| alphabetical halves, no prediction | 5.14 | 1.8 |
| frequency-weighted halves | 2.61 | 3.5 |
| frequency-weighted + 4 word predictions (default) | **2.48** | 3.7 |
| default, user makes 5% wrong looks | 3.24 | 2.8 |
| default, user makes 10% wrong looks | 4.74 | 1.9 |
| default, same phrases again with memory of the first pass | **1.77** | 5.2 |

Simulated user who always takes the shortest route; words/min assumes 0.8 s dwell plus 0.5 s to look back to the center and read the next screen. Reproduce with `npm run bench`. The last row is the same 500 phrases typed a second time, after the board has remembered the first pass on the device; a first visit is still 2.48. A short personal set of four sentences (including a name the dictionary does not have) went from 2.65 looks per character on the first pass to 0.67 on the fifth. For comparison, dwell-time eye typing with a dedicated tracker and an on-screen keyboard is usually reported at about 5-10 words per minute ([Majaranta & Räihä, 2002](https://doi.org/10.1145/507072.507076)). The numbers above are not from real users.

Also on the board:

- **Quick phrases**: on an empty line, one item opens a list of 12 phrases ("yes", "no", "I am in pain", "please call the nurse"...) that are spoken as soon as they are picked. Edit the list in Settings. Phrases you pick often move towards the top.
- **Memory**: words you have spoken stay on this device, so names the dictionary does not have and the word you usually say next are offered sooner. Forget them in Settings.
- **Head mode** for people whose eye movement is limited but who can turn their head a little.
- **Keys or switches**: left/right/up arrows, `1`/`2`, or a click on a half. Most USB accessibility switches can be set to send these keys.
- **Speech** with any voice installed on your system (Settings).

## Setup

1. Open the [demo page](https://tahakocp.github.io/lookspeak/) and allow the camera.
2. Pick "Use my eyes". Keep your head still and follow the dot: center, left, center, right, center, top, center (about 17 seconds).
3. Type. Recalibrate whenever the light changes or the laptop moves.

Tips from testing the classifier: sit about an arm's length from the camera, face the light rather than having a window behind you, and raise the dwell time (Settings) if letters get picked while reading. The footer shows which direction is currently detected.

### Offline or self-hosted

After the first visit, the page, the 3.7 MB face model and the word list are cached, and it opens without a network. To run it on a machine that is never online, download the `-web.zip` file from the [latest release](https://github.com/tahakocp/lookspeak/releases/latest), unzip it and serve the folder on localhost (browsers only allow the camera on `https://` or `localhost`):

```sh
cd lookspeak-v0.2.0-web && python3 -m http.server 8080   # then open http://localhost:8080
```

### Build from source

```sh
git clone https://github.com/tahakocp/lookspeak && cd lookspeak
npm ci && npm run build && npm run serve
```

## How it is tested

| what | how | result |
|---|---|---|
| board, prediction, memory, undo, quick phrases | `npm test`, 33 unit tests in Node | pass |
| direction classifier and dwell timing | synthetic noisy feature streams | >97% correct per frame, blinks under 250 ms ignored, one selection per look |
| whole app with the real model | `npm run e2e`: headless Chrome, MediaPipe Face Landmarker, webcam replaced by test photos | calibration accepted, "hi" + undo typed by gaze, matches the keyboard path, a 350 ms glance does not fire; same with the CPU throttled 6x |
| typing speed | `npm run bench` | table above |
| face tracking speed | e2e runs in headless Chrome, no real GPU | 13-16 frames/s on an 8-core VM, 4-8.5 on GitHub Actions runners (shared CPUs; typing still works at 4) |
| offline | live Pages site loaded once, then Chrome set offline and reloaded | model, word list and calibration load from cache; board works |

The e2e photos are a public-domain NASA portrait with the irises cut out and moved by 0.9 iris radii ([e2e/make_fixtures.py](e2e/make_fixtures.py)). MediaPipe's gaze blendshapes read them as expected (horizontal score +0.22 straight ahead, +0.80 looking left, -0.53 looking right; vertical +0.06 to +0.23 looking up), which lets the test drive the real pipeline without a person.

What has not been tested: real people, real webcams, glasses, low light, nystagmus or other eye conditions, and head mode on a moving head (its math has a unit test; the photos cannot turn). Looking up is the weakest direction in the photos and will likely be the weakest for some users. If you try it, please [open an "I tried it" issue](https://github.com/tahakocp/lookspeak/issues/new?template=tried-it.md), whether it worked or not.

## Privacy

Video frames go into the MediaPipe model inside the page and nothing else. There is no server, analytics or account. Settings, calibration and the words you have spoken live in your browser's local storage. You can forget the remembered words in Settings.

## Limitations

- English only for now (word list and letters). The board code is language-neutral; a new language needs a frequency list.
- On a first visit the board only knows the public word list. Memory helps after you have spoken a few sentences, and only in that browser.
- Speech quality depends on the voices your OS provides; some browsers need a network for their best voices.
- Not a medical device. Do not rely on it as the only way to call for help.

## Credits

Face tracking: [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (Apache-2.0). Word frequencies: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), from OpenSubtitles 2018 (CC BY-SA 4.0, see [data/README.md](data/README.md)). Benchmark phrases: MacKenzie & Soukoreff, "Phrase sets for evaluating text entry techniques", CHI 2003, downloaded at bench time. The two-halves interaction follows Google's [Look to Speak](https://experiments.withgoogle.com/looktospeak) Android app; lookspeak is unrelated to Google.

Built with help from AI coding tools; the tests and numbers above are from real runs.

## License

MIT for the code. `data/words.txt` is CC BY-SA 4.0.
