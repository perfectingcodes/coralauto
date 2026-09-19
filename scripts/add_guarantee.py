"""Add the Customer Guarantee badge, reusing the logo knockout from process_assets."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from process_assets import knockout_white, save, OUT, DL

SRC = f"{DL}/hf_20260919_031005_d68b3e5a-8249-49d1-bf3f-40da18ee1042.png"
badge = knockout_white(SRC)
print("guarantee badge:")
save(badge.resize((640, int(640 * badge.size[1] / badge.size[0])), Image.LANCZOS),
     "guarantee.webp", "WEBP", quality=92, method=6)
save(badge.resize((440, int(440 * badge.size[1] / badge.size[0])), Image.LANCZOS),
     "guarantee.png", "PNG", optimize=True)
