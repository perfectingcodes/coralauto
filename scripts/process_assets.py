"""One-off asset pipeline: transparent logo + derived imagery for Coral Auto Spa."""
from collections import deque
from PIL import Image, ImageFilter
import os

DL = os.path.expanduser("~/Downloads")
OUT = "public/assets/img"
LOGO_SRC = f"{DL}/hf_20260919_023435_811fed6d-d79c-401d-bca0-8fd4d4e49150.png"
HERO_SRC = f"{DL}/hf_20260919_025211_96079303-41e3-41c5-a944-d6f7bcb2628f.png"
PALM_SRC = f"{DL}/hf_20260919_025156_fd98e8db-5509-4c93-8ba4-a4896a6c1478.png"

os.makedirs(OUT, exist_ok=True)


def knockout_white(path, thresh=232):
    """Flood-fill white from the borders so enclosed white (letter fills) survives."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()

    def whiteish(x, y):
        r, g, b, _ = px[x, y]
        return min(r, g, b) >= thresh

    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and whiteish(x, y):
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and whiteish(x, y):
                seen[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and whiteish(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    # Hard alpha from the fill, then feather one ring so edges are not jagged.
    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if seen[row + x]:
                ap[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(alpha)
    return im.crop(im.getbbox())


def save(im, name, fmt="WEBP", **kw):
    p = os.path.join(OUT, name)
    im.save(p, fmt, **kw)
    print(f"  {name}  {im.size[0]}x{im.size[1]}  {os.path.getsize(p)//1024}KB")



def main():
    print("logo:")
    logo = knockout_white(LOGO_SRC)
    save(logo.resize((720, int(720 * logo.size[1] / logo.size[0])), Image.LANCZOS),
         "logo.webp", "WEBP", quality=92, method=6)
    save(logo.resize((512, int(512 * logo.size[1] / logo.size[0])), Image.LANCZOS),
         "logo.png", "PNG", optimize=True)
    # Square favicon on transparent canvas
    fav = logo.copy()
    fav.thumbnail((512, 512), Image.LANCZOS)
    sq = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    sq.paste(fav, ((512 - fav.size[0]) // 2, (512 - fav.size[1]) // 2), fav)
    save(sq, "favicon.png", "PNG", optimize=True)
    
    print("hero + backdrop:")
    hero = Image.open(HERO_SRC).convert("RGB")
    save(hero, "hero.webp", "WEBP", quality=86, method=6)
    palm = Image.open(PALM_SRC).convert("RGB")
    save(palm, "palms.webp", "WEBP", quality=84, method=6)
    
    print("derived cards (4:3 crops of the hero):")
    W, H = hero.size
    CARDS = {
        # name: (left, top, right, bottom) in source pixels
        "card-exterior.webp": (0, 60, 520, 450),      # foam-covered grille
        "card-full.webp":     (330, 40, 980, 530),    # full truck flank in sun
        "card-detail.webp":   (620, 150, 1344, 690),  # detailer + sunset
    }
    for name, box in CARDS.items():
        c = hero.crop(box).resize((900, 675), Image.LANCZOS)
        save(c, name, "WEBP", quality=84, method=6)
    
    # Wide process shot for the "how it works" band
    save(hero.crop((700, 0, 1344, 600)).resize((1000, 932), Image.LANCZOS),
         "process.webp", "WEBP", quality=84, method=6)


if __name__ == "__main__":
    main()
