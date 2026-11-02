"""
Cleans shadow/whitish residue left inside frame photo windows.

Frames that were white-keyed keep opaque light-gray patches where a shadow
fell on the white placeholder. This script makes those pixels transparent,
flood-filling from the window's existing transparent area so real design
elements (stickers, text) are never touched. Edge pixels get a soft alpha
feather so the cutout doesn't look jagged.

Usage: python3 scripts/fix_shadow_white.py [--all | PB02 ...]
"""

import os
import re
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")
BACKUP_DIR = os.path.join(FRAMES_DIR, "backup")


def get_windows():
    src = open(os.path.join(ROOT, "script.js"), encoding="utf-8").read()
    frames = []
    for m in re.finditer(
        r'title:\s*"([^"]+)",\s*windows:\s*\[([^\]]+)\]', src, re.S
    ):
        nums = [int(x) for x in re.findall(r"\d+", m.group(2))]
        frames.append([nums[i : i + 4] for i in range(0, len(nums), 4)])
    return frames


def dilate(mask):
    grown = mask.copy()
    grown[1:, :] |= mask[:-1, :]
    grown[:-1, :] |= mask[1:, :]
    grown[:, 1:] |= mask[:, :-1]
    grown[:, :-1] |= mask[:, 1:]
    return grown


def flood_from_transparent(eligible, seeds):
    """BFS over `eligible` pixels reachable by expanding `seeds`."""
    frontier = dilate(seeds) & eligible
    while True:
        grown = (dilate(frontier) & eligible) | frontier
        if (grown == frontier).all():
            return frontier
        frontier = grown


def soft_edge(a, mask):
    """Give pixels adjacent to the cleared mask a partial alpha if grayish."""
    r, g, b, al = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int), a[..., 3]
    grayish = (
        (al > 0)
        & (abs(r - g) < 40)
        & (abs(g - b) < 40)
        & (abs(r - b) < 40)
        & (r > 120)
    )
    adj = np.zeros_like(mask)
    adj[1:, :] |= mask[:-1, :]
    adj[:-1, :] |= mask[1:, :]
    adj[:, 1:] |= mask[:, :-1]
    adj[:, :-1] |= mask[:, 1:]
    touch = adj & grayish & ~mask
    a[touch, 3] = 60
    return a


def clean_frame(path, windows):
    a = np.array(Image.open(path).convert("RGBA"))
    changed = 0
    for (x1, y1, x2, y2) in windows:
        win = a[y1:y2, x1:x2]
        r, g, b, al = win[..., 0].astype(int), win[..., 1].astype(int), win[..., 2].astype(int), win[..., 3]
        transparent = al < 250
        # shadow residue: any bright low-saturation pixel (white -> light gray,
        # opaque or semi-transparent) connected to the window's transparency
        residue = (
            (al > 0)
            & (r > 140)
            & (g > 140)
            & (b > 140)
            & (abs(r - g) < 40)
            & (abs(g - b) < 40)
            & (abs(r - b) < 40)
        )
        if transparent.sum() == 0 or residue.sum() == 0:
            continue
        cleared = flood_from_transparent(residue, transparent)
        win[cleared] = (0, 0, 0, 0)
        win[:] = soft_edge(win.copy(), cleared)
        changed += int(cleared.sum())
    if changed:
        shutil.copy2(path, os.path.join(BACKUP_DIR, os.path.basename(path)))
        Image.fromarray(a).save(path)
    return changed


def main():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    frames = get_windows()
    only = {a.upper().replace(".PNG", "") for a in sys.argv[1:]} if len(sys.argv) > 1 else None
    for i, windows in enumerate(frames, 1):
        name = f"PB{i:02d}"
        if only and name not in only:
            continue
        path = os.path.join(FRAMES_DIR, f"{name}.png")
        n = clean_frame(path, windows)
        status = f"cleared {n} px" if n else "clean, no changes"
        print(f"{name}: {status}")


if __name__ == "__main__":
    main()
