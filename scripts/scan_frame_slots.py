
"""
Frame Slot Scanner
Detects photo cutouts/windows (transparent or pure white rectangular areas)
in photobooth frame images and generates exact pixel bounding boxes [x, y, w, h].
"""

import sys
import os
import json
from PIL import Image
import numpy as np

def scan_frame(frame_path, is_white_keyed=True):
    img = Image.open(frame_path).convert('RGBA')
    arr = np.array(img)
    h, w, c = arr.shape

    alpha = arr[:, :, 3]
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]

    transparent_mask = (alpha < 50)
    white_mask = (r > 240) & (g > 240) & (b > 240) & (alpha > 200)

    if np.sum(transparent_mask) > (w * h * 0.05):
        mask = transparent_mask
    elif is_white_keyed:
        mask = white_mask
    else:
        mask = transparent_mask

    row_counts = np.sum(mask, axis=1)
    threshold_width = w * 0.35

    in_slot = False
    slots_y = []
    start_y = 0

    for y in range(h):
        if row_counts[y] > threshold_width:
            if not in_slot:
                in_slot = True
                start_y = y
        else:
            if in_slot:
                in_slot = False
                end_y = y
                if (end_y - start_y) > (h * 0.1):
                    slots_y.append((start_y, end_y))
    if in_slot:
        end_y = h
        if (end_y - start_y) > (h * 0.1):
            slots_y.append((start_y, end_y))

    results = []
    for y1, y2 in slots_y:
        sub_mask = mask[y1:y2, :]
        col_counts = np.sum(sub_mask, axis=0)
        threshold_height = (y2 - y1) * 0.5
        xs = np.where(col_counts > threshold_height)[0]
        if len(xs) > 0:
            x1, x2 = xs[0], xs[-1]
            results.append({
                "x": int(x1),
                "y": int(y1),
                "width": int(x2 - x1),
                "height": int(y2 - y1)
            })

    return {
        "file": os.path.basename(frame_path),
        "frame_width": w,
        "frame_height": h,
        "detected_slots_count": len(results),
        "slots": results
    }

if __name__ == '__main__':
    if len(sys.argv) > 1:
        target = sys.argv[1]
        print(json.dumps(scan_frame(target), indent=2))
    else:
        print("Usage: python3 scan_frame_slots.py <path_to_frame_png>")
