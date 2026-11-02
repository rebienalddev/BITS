"""
Prepares final white-keyed frame PNGs for use in the app.

Final frames arrive as opaque art with pure-white rectangular
placeholder slots (optionally darkened by shadows). This script:
  1. detects the slot rectangles from the white mask,
  2. floods the slot's white area, spreading through shadowed gray/whitish
     pixels, and makes them transparent,
  3. feathers the cut edge so leftover shadow halves don't look jagged.

Photos are composited under the frame, so slots must end up transparent.

Usage: python3 scripts/prepare_final_frames.py <src_dir> <out_dir>
"""

import os
import re
import sys

import numpy as np
from PIL import Image


def dilate(mask):
    grown = mask.copy()
    grown[1:, :] |= mask[:-1, :]
    grown[:-1, :] |= mask[1:, :]
    grown[:, 1:] |= mask[:, :-1]
    grown[:, :-1] |= mask[:, 1:]
    return grown


def flood(eligible, seeds):
    frontier = dilate(seeds) & eligible
    while True:
        grown = (dilate(frontier) & eligible) | frontier
        if (grown == frontier).all():
            return frontier
        frontier = grown


def detect_slots(a):
    h, w = a.shape[:2]
    r, g, b, al = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int), a[..., 3]
    core = (al > 200) & (r > 235) & (g > 235) & (b > 235)
    row_counts = core.sum(axis=1)
    slots = []
    in_slot = False
    start = 0
    for y in range(h):
        filled = row_counts[y] > w * 0.35
        if filled and not in_slot:
            in_slot, start = True, y
        elif not filled and in_slot:
            in_slot = False
            if y - start > 100:
                slots.append((start, y))
    for y1, y2 in slots:
        col_counts = core[y1:y2].sum(axis=0)
        xs = np.where(col_counts > (y2 - y1) * 0.5)[0]
        if len(xs):
            slots[slots.index((y1, y2))] = (int(xs.min()), y1, int(xs.max()) + 1, y2)
    return slots


def key_frame(path):
    a = np.array(Image.open(path).convert("RGBA"))
    windows = detect_slots(a)
    for (x1, y1, x2, y2) in windows:
        pad = 4
        win = a[y1 + pad : y2 - pad, x1 + pad : x2 - pad]
        r, g, b, al = win[..., 0].astype(int), win[..., 1].astype(int), win[..., 2].astype(int), win[..., 3]
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        # pure white seeds + spread through shadows: bright, low-saturation pixels
        seeds = (al > 200) & (r > 235) & (g > 235) & (b > 235)
        eligible = (al > 60) & (mx > 110) & ((mx - mn) < 55)
        cleared = flood(eligible, seeds)
        win[cleared] = (0, 0, 0, 0)
        # feather: semi-transparent any leftover low-sat pixel next to the cut
        grayish = ((mx - mn) < 55) & (mx > 110) & ~cleared
        adj = dilate(cleared) & grayish & ~cleared
        win[adj, 3] = 70
    return a, windows


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    offset = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    import glob
    files = sorted(
        glob.glob(os.path.join(src_dir, "*.png")),
        key=lambda p: int(re.search(r"(\d+)\.png$", os.path.basename(p)).group(1)),
    )
    for f in files:
        n = int(re.search(r"(\d+)\.png$", os.path.basename(f)).group(1))
        a, windows = key_frame(f)
        out = os.path.join(out_dir, f"PB{n + offset - 1:02d}.png")
        Image.fromarray(a).save(out)
        wins = [list(w) for w in windows]
        print(f"{os.path.basename(f)} -> {os.path.basename(out)} windows={wins}")


if __name__ == "__main__":
    main()
