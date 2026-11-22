"""One-switch recording with a caption and a marker on frames where the switch was pressed."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

frames_dir, out = Path(sys.argv[1]), sys.argv[2]
meta = json.loads((frames_dir / "meta.json").read_text())
font = ImageFont.truetype("DejaVuSans.ttf", 22)
small = ImageFont.truetype("DejaVuSans.ttf", 18)
fs = meta["frames"]

frames, durations = [], []
for k, f in enumerate(fs):
    shot = Image.open(frames_dir / f"{k:03d}.png").convert("RGB")
    w, h = shot.size
    img = Image.new("RGB", (w, h + 64), (16, 20, 24))
    img.paste(shot, (0, 64))
    d = ImageDraw.Draw(img)
    d.text((14, 8), f"one switch, zones lit in turn ({meta['step']} ms each)", font=font, fill=(230, 230, 230))
    d.text((14, 36), f"{f['presses']} presses", font=small, fill=(170, 170, 170))
    if f["pressed"]:
        d.rounded_rectangle((w - 130, 10, w - 14, 50), radius=8, fill=(255, 176, 32))
        d.text((w - 112, 18), "press", font=font, fill=(17, 17, 17))
    frames.append(img.resize((w * 3 // 4, (h + 64) * 3 // 4), Image.LANCZOS))
    nxt = fs[k + 1]["t"] if k + 1 < len(fs) else f["t"] + 2500
    durations.append(max(40, nxt - f["t"]))
durations[-1] = 3000
frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print(f"wrote {out}: {len(frames)} frames, real time")
