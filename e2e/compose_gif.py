"""Puts the two recorded boards side by side with a look counter above each."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

frames_dir, out = Path(sys.argv[1]), sys.argv[2]
meta = json.loads((frames_dir / "meta.json").read_text())
font = ImageFont.truetype("DejaVuSans.ttf", 22)
small = ImageFont.truetype("DejaVuSans.ttf", 18)
titles = ["word frequencies only", "+ on-device language model"]

frames = []
n = len(meta["counts"])
for k, counts in enumerate(meta["counts"]):
    panels = [Image.open(frames_dir / f"{k:03d}-{i}.png").convert("RGB") for i in range(2)]
    w, h = panels[0].size
    img = Image.new("RGB", (2 * w + 12, h + 64), (16, 20, 24))
    d = ImageDraw.Draw(img)
    for i, p in enumerate(panels):
        x = i * (w + 12)
        img.paste(p, (x, 64))
        d.text((x + 14, 8), titles[i], font=font, fill=(230, 230, 230))
        d.text((x + 14, 36), f"{counts[i]} looks", font=small, fill=(255, 200, 80) if i else (170, 170, 170))
    frames.append(img.resize((img.width * 3 // 4, img.height * 3 // 4), Image.LANCZOS))

durations = [350] * n
durations[0] = 1200
durations[-1] = 3500
frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print(f"wrote {out}: {n} frames")
