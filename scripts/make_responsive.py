"""Generate small variants of the large images so phones don't download
desktop-sized files."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image

OUT = "public/assets/img"

# file -> small width.
# Widths are chosen so a DPR-2 phone actually selects them: the browser needs
# (CSS display width x 2) device pixels, so a variant below that is ignored.
VARIANTS = {
    "hero.webp": 760,
    "palms.webp": 760,
    "process.webp": 640,
    "guarantee.webp": 380,
    "card-wash.webp": 700,
    "card-interior.webp": 700,
    "card-polish.webp": 700,
    "card-addons.webp": 700,
    "card-detail.webp": 700,
    "gal-foam.webp": 700,
    "gal-gloss.webp": 700,
    "gal-interior.webp": 700,
    "gal-wheels.webp": 700,
    "pkg-gold.webp": 480,
    "pkg-platinum.webp": 480,
    "pkg-mvp.webp": 480,
}

total_before = total_after = 0
for name, w in VARIANTS.items():
    src = os.path.join(OUT, name)
    if not os.path.exists(src):
        print(f"  skip (missing) {name}")
        continue
    im = Image.open(src)
    mode = "RGBA" if im.mode in ("RGBA", "LA", "P") and "pkg-" in name or "guarantee" in name else im.mode
    im = im.convert("RGBA") if ("pkg-" in name or "guarantee" in name) else im.convert("RGB")
    if im.width <= w:
        print(f"  skip (already small) {name}")
        continue
    h = round(w * im.height / im.width)
    small = im.resize((w, h), Image.LANCZOS)
    out = os.path.join(OUT, name.replace(".webp", "-sm.webp"))
    small.save(out, "WEBP", quality=80, method=6)
    a, b = os.path.getsize(src), os.path.getsize(out)
    total_before += a; total_after += b
    print(f"  {name:24s} {a//1024:4d}KB -> {os.path.basename(out):28s} {b//1024:4d}KB  ({w}x{h})")

print(f"\n  small set totals {total_after//1024}KB vs {total_before//1024}KB full size")
