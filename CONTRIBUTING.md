# Contributing

Reports from real use matter most right now. If you or someone you help tried lookspeak, open an issue with the "I tried it" template, even if it failed.

## Development

```sh
npm ci
npm test          # unit tests, no browser needed
npm run typecheck
npm run build     # writes dist/, downloads the face model once (checksum-verified)
npm run serve     # http://localhost:8080
npm run e2e       # headless Chrome, needs google-chrome or chromium
npm run bench     # selections per character on the MacKenzie phrase set
npm run bench:lm  # same with the language model (downloads 182 MB once, ~6 min)
npm run e2e:lm    # the language model in headless Chrome (same download)
npm run bench:lang  # every board language on 500 Tatoeba sentences (downloads ~70 MB once)
```

Node 22.18 or newer runs the TypeScript sources directly (type stripping), so tests have no build step. Keep code to erasable TypeScript: no enums, no parameter properties.

A change to the board, the lexicon weights, the language model wiring or the dwell logic should come with the `npm run bench` (or `bench:lm`) table before and after. The context weight was tuned on phrases 1-100; if you tune anything, tune on those and report 101-500 separately.

## Good first issues

- Try the language model on a real GPU and report the "last answer" time shown in Settings.
- A small fallback model for machines that cannot spare 182 MB (a word trigram table would be a few MB).
- Another board language: add an entry to `src/languages.ts`, run `node scripts/words.mjs <code>`, and post the `npm run bench:lang` row. Native speakers checking the quick phrases of the existing languages help too.
- Try long-blink selection on a real face (one-switch mode, Settings) and report what min/max closure times worked.
- High-contrast and large-print themes.
