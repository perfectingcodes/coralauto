"""Knock out the package badge backgrounds and emit web sizes."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from process_assets import knockout_white, save, DL

BADGES = {
    "pkg-mvp":      "hf_20260919_031706_295db895-7c20-4811-af95-97faac411dbf.png",
    "pkg-gold":     "hf_20260919_031722_9f2b09a2-148a-4923-bad5-39fceb28f183.png",
    "pkg-platinum": "hf_20260919_031818_4b9161e0-279e-471b-8527-2ea6ec5ce867.png",
}

for name, src in BADGES.items():
    print(f"{name}:")
    im = knockout_white(os.path.join(DL, src))
    w = 520
    save(im.resize((w, int(w * im.size[1] / im.size[0])), Image.LANCZOS),
         f"{name}.webp", "WEBP", quality=92, method=6)
