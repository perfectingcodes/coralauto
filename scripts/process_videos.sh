#!/usr/bin/env bash
#
# Coral Auto Spa — turn iPhone job clips into web video.
#
# The originals are HEVC .MOV straight off a phone: 1080x1920, 6-16MB each.
# HEVC in MP4 does not play reliably outside Safari, so everything is
# re-encoded to H.264, which every browser handles. Portrait is preserved —
# these are shot vertically and that is how they should play.
#
# Uses avconvert, which ships with macOS, so there is no ffmpeg dependency.
# avconvert exposes no bitrate control, only presets; Preset960x540 gives
# 540x960 for a portrait source, which is sharp on a phone and acceptable
# full screen.
#
# Posters come from roughly 45% into each clip. The first frame of a phone
# video is usually mid-motion or still focusing.
#
# The clips are silent. avconvert cannot drop an audio track, so a small
# AVFoundation helper (scripts/strip_audio.swift) remuxes the video track on
# its own, passthrough — no re-encode, no quality loss.
#
# Usage:  scripts/process_videos.sh [source-dir]      (default ~/Downloads)
set -euo pipefail

SRC="${1:-$HOME/Downloads}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VID_OUT="$ROOT/public/assets/video"
IMG_OUT="$ROOT/public/assets/img"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$VID_OUT" "$IMG_OUT"

# Build the audio stripper once per run.
STRIP="$TMP/strip_audio"
if xcrun swiftc -O -o "$STRIP" "$ROOT/scripts/strip_audio.swift" 2>/dev/null; then
  :
else
  echo "  WARNING: could not build scripts/strip_audio.swift (needs Xcode command line tools)."
  echo "           Clips will keep their audio track."
  STRIP=""
fi

# source basename | output slug | seconds into the clip for the poster
CLIPS="
IMG_1647|foam-wash|3.3
IMG_1430|console|6.5
IMG_1540|interior-reset|4.7
IMG_1717|seats-dash|2.9
IMG_1432|finished-ram|2.7
IMG_1663|finished-truck|2.5
IMG_1525|door-pockets|3.6
"

echo "$CLIPS" | while IFS='|' read -r base slug at; do
  [ -z "$base" ] && continue
  in="$SRC/$base.MOV"
  if [ ! -f "$in" ]; then
    echo "  skip $base — not found in $SRC"
    continue
  fi

  # --- the clip itself ---
  out="$VID_OUT/$slug.mp4"
  avconvert --source "$in" --output "$out" --preset Preset960x540 --replace >/dev/null 2>&1

  # --- drop the audio track ---
  if [ -n "$STRIP" ]; then
    if "$STRIP" "$out" "$TMP/$slug-silent.mp4" 2>/dev/null; then
      mv "$TMP/$slug-silent.mp4" "$out"
    else
      echo "  WARNING: could not strip audio from $slug"
    fi
  fi

  # --- the poster: a short cut at `at` seconds, thumbnailed, then WebP ---
  cut="$TMP/$slug-cut.mp4"
  avconvert --source "$in" --output "$cut" --preset Preset960x540 \
            --start "$at" --duration 0.4 --replace >/dev/null 2>&1
  qlmanage -t -s 1080 -o "$TMP" "$cut" >/dev/null 2>&1

  python3 - "$TMP/$slug-cut.mp4.png" "$IMG_OUT/vid-$slug.webp" <<'PY'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
# Match the encoded video so the poster and first frame line up exactly.
im = im.resize((540, 960), Image.LANCZOS)
im.save(dst, "WEBP", quality=82, method=6)
PY

  printf "  %-16s %6s video   %6s poster\n" "$slug" \
    "$(du -h "$out" | cut -f1)" "$(du -h "$IMG_OUT/vid-$slug.webp" | cut -f1)"
done

echo
echo "  video total: $(du -ch "$VID_OUT"/*.mp4 2>/dev/null | tail -1 | cut -f1)"
