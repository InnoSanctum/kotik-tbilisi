#!/usr/bin/env python3
"""
Rebuild media/ from full-size originals.

Usage:  python tools/build_media.py  path/to/photo.jpg [more.jpg ...]

For every input it writes:
    media/<name>.webp          long edge <= 1600px, quality 82
    media/thumbs/<name>.webp   400x400 centre crop, quality 80

EXIF orientation is applied to the pixels first, then all metadata is
dropped (that includes GPS coordinates and the camera model).

<name> comes from the EXIF capture date (kotik-YYYY-MM-DD), falling back
to the source filename. A letter suffix is added when two photos share a
date, so re-running is stable.

Afterwards add the new entry to media.js by hand -- this script never
touches it, so hand-written alt text is never overwritten. Then run
tools/check_site.py to confirm nothing is broken.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
THUMBS = MEDIA / "thumbs"

MAX_EDGE = 1600
FULL_Q = 82
THUMB_PX = 400
THUMB_Q = 80


def target_name(src: Path) -> str:
    """kotik-YYYY-MM-DD from EXIF, else the source stem."""
    try:
        exif = Image.open(src).getexif()
        # 36867 DateTimeOriginal, 306 DateTime
        raw = exif.get(36867) or exif.get(306)
        if raw:
            date = str(raw).split(" ")[0].replace(":", "-")
            if len(date) == 10:
                return f"kotik-{date}"
    except Exception:
        pass
    return src.stem


def unique(stem: str, taken: set) -> str:
    """First photo of a day keeps the bare date, later ones get a/b/c."""
    if stem not in taken:
        taken.add(stem)
        return stem
    for suffix in "abcdefghijklmnopqrstuvwxyz":
        cand = f"{stem}{suffix}"
        if cand not in taken:
            taken.add(cand)
            return cand
    raise RuntimeError(f"too many photos named {stem}")


def convert(src: Path, name: str) -> dict:
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)  # bake rotation in before metadata is dropped
    im = im.convert("RGB")

    full = im.copy()
    full.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)  # only ever shrinks
    full_path = MEDIA / f"{name}.webp"
    full.save(full_path, "WEBP", quality=FULL_Q, method=6)

    thumb = ImageOps.fit(im, (THUMB_PX, THUMB_PX), Image.LANCZOS, centering=(0.5, 0.5))
    thumb_path = THUMBS / f"{name}.webp"
    thumb.save(thumb_path, "WEBP", quality=THUMB_Q, method=6)

    return {
        "name": name,
        "src_bytes": src.stat().st_size,
        "full_bytes": full_path.stat().st_size,
        "thumb_bytes": thumb_path.stat().st_size,
        "full_size": full.size,
    }


def main(argv):
    if not argv:
        print(__doc__)
        return 1

    MEDIA.mkdir(exist_ok=True)
    THUMBS.mkdir(exist_ok=True)

    taken = {p.stem for p in MEDIA.glob("*.webp")}
    results = []
    for arg in argv:
        src = Path(arg)
        if not src.is_absolute():
            src = ROOT / src
        if not src.exists():
            print(f"skip (not found): {src}")
            continue
        results.append(convert(src, unique(target_name(src), taken)))

    saved_full = sum(r["src_bytes"] for r in results) - sum(r["full_bytes"] for r in results)
    for r in results:
        print(
            f"{r['name']:22} {r['full_size'][0]:>4}x{r['full_size'][1]:<4} "
            f"{r['src_bytes']/1048576:6.2f}MB -> {r['full_bytes']/1024:7.1f}KB "
            f"(thumb {r['thumb_bytes']/1024:5.1f}KB)"
        )
    print(f"\n{len(results)} file(s), {saved_full/1048576:.1f} MB saved on full-size versions")
    print(json.dumps([r["name"] for r in results], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
