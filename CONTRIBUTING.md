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
```

Node 22.18 or newer runs the TypeScript sources directly (type stripping), so tests have no build step. Keep code to erasable TypeScript: no enums, no parameter properties.

A change to the board, the lexicon weights or the dwell logic should come with the `npm run bench` table before and after.

## Good first issues

- Bigram word prediction (next word given the previous one). The bench shows how much it helps.
- More languages: a word list and letter set per language; the board code is language-neutral.
- A "scan" mode for single-switch users (one key or one blink steps through halves automatically).
- High-contrast and large-print themes.
