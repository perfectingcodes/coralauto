"""Crop and encode the licensed stock photography used on the service cards
and in the gallery. Sources are Unsplash (Unsplash License: free commercial
use, no attribution required). Originals live in the scratchpad, not the repo."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from process_assets import save

SRC = ("/private/tmp/claude-501/-Users-sandin-Projects-coralauto/"
       "5fb38081-88f7-483c-8b5d-9fee02e95b68/scratchpad/stock")

def crop_to(im, ratio, focus_y=0.5, focus_x=0.5):
    """Center-ish crop to an aspect ratio, biased by focus point."""
    w, h = im.size
    if w / h > ratio:
        nw = int(round(h * ratio))
        left = int((w - nw) * focus_x)
        box = (left, 0, left + nw, h)
    else:
        nh = int(round(w / ratio))
        top = int((h - nh) * focus_y)
        box = (0, top, w, top + nh)
    return im.crop(box)

# name -> (source, output, width, height, focus_y)
JOBS = [
    # Service cards, 4:3
    ("ext-a",   "card-wash.webp", 900, 675, 0.5),
    ("int-a",   "card-interior.webp", 900, 675, 0.5),
    ("full-a",  "card-polish.webp",     900, 675, 0.42),
    ("addon-b", "card-addons.webp",   900, 675, 0.5),
    # Gallery
    ("ext-b",   "gal-foam.webp",      900, 675, 0.38),
    ("full-b",  "gal-gloss.webp",     900, 675, 0.5),
    ("int-b",   "gal-interior.webp",  900, 675, 0.5),
    ("addon-a", "gal-wheels.webp",    900, 675, 0.45),
]

for src, out, w, h, fy in JOBS:
    im = Image.open(os.path.join(SRC, f"{src}.jpg")).convert("RGB")
    im = crop_to(im, w / h, focus_y=fy).resize((w, h), Image.LANCZOS)
    save(im, out, "WEBP", quality=82, method=6)
