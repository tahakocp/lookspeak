# Data

`words.txt` holds the 20,000 most frequent English words (lowercase, letters and one apostrophe only) with their counts, taken from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) `content/2018/en/en_50k.txt`, which is built from OpenSubtitles 2018.
Subtitles are close to spoken language, which is what an AAC user types.

`words-<lang>.txt` (Turkish, Spanish, German, French, Brazilian Portuguese, Italian) are made the same way from the matching FrequencyWords lists by `node scripts/words.mjs`: the 20,000 most frequent words that the board's letters for that language can spell. French and Italian elisions (`l'`, `qu'`, `dell'`) stay as separate words, as in the source lists.

License of these files: CC BY-SA 4.0 (Hermit Dave). The rest of the repository is MIT.
