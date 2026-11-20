import json, sys, numpy as np
from PIL import Image, ImageDraw
im = Image.open('face.png').convert('RGB'); W, H = im.size
lm = np.array(json.load(open('out.json'))['face.png']['lm']) * [W, H]
eyes = [(468, [469,470,471,472], [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]),
        (473, [474,475,476,477], [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466])]
src = np.asarray(im).astype(float)
def make(dx, dy, name):
    out = src.copy()
    for c, ring, contour in eyes:
        cx, cy = lm[c]; r = np.mean([np.hypot(*(lm[i]-lm[c])) for i in ring])
        mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon([tuple(lm[i]) for i in contour], fill=255)
        m = np.asarray(mask) > 0
        yy, xx = np.mgrid[0:H, 0:W]
        iris = (xx-cx)**2 + (yy-cy)**2 <= (r*1.05)**2
        scl = src[m & ~iris]
        bright = scl[scl.sum(1) > np.percentile(scl.sum(1), 60)]
        fill = np.median(bright, axis=0)
        out[m] = fill
        sx, sy = dx*r, dy*r
        moved = (xx-cx-sx)**2 + (yy-cy-sy)**2 <= (r*1.05)**2
        ys, xs = np.nonzero(moved & m)
        out[ys, xs] = src[np.clip((ys-sy).round().astype(int),0,H-1), np.clip((xs-sx).round().astype(int),0,W-1)]
    Image.fromarray(out.clip(0,255).astype(np.uint8)).save(name)
make(0,0,'g_center.png'); make(-0.9,0,'g_imgleft.png'); make(0.9,0,'g_imgright.png'); make(0,-0.6,'g_up.png')
