#!/usr/bin/env python3
"""
Sanity-check the site before publishing.  Run:  python tools/check_site.py

Catches the things that are easy to get wrong when adding media:
  * a typo in media.js (missing comma / quote) that would blank the gallery
  * a path in media.js that does not exist on disk
  * alt text missing for one of the three languages
  * the hard-coded first photo in index.html no longer matching KOTIK_MEDIA[0]
    (it is hard-coded on purpose so it paints immediately -- but that means
     changing the FIRST entry means editing index.html too)
  * a translation key present in one language but not the others

Exits non-zero if anything is wrong.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")


def load_manifest():
    """media.js is `window.KOTIK_MEDIA = [ ...json... ];` -- pull out the array."""
    text = (ROOT / "media.js").read_text(encoding="utf-8")
    m = re.search(r"window\.KOTIK_MEDIA\s*=\s*(\[.*\])\s*;", text, re.S)
    if not m:
        print("FAIL\n - media.js does not assign window.KOTIK_MEDIA = [ ... ];")
        sys.exit(1)
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError as e:
        line = m.group(1)[: e.pos].count("\n") + text[: m.start(1)].count("\n") + 1
        print(f"FAIL\n - media.js is malformed around line {line}: {e.msg}")
        print("   (usually a missing comma between entries, or a stray trailing comma)")
        sys.exit(1)

fail = []

# 1. every local src=/href= in index.html resolves to a real file
refs = re.findall(r'(?:src|href)="([^"]+)"', html)
for r in refs:
    # skip fragments, protocol-relative URLs and anything with a URI scheme
    # (http:, https:, data:, mailto:, tel: ...) -- only local paths are checked
    if r.startswith(("#", "//")) or re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:", r):
        continue
    if not (ROOT / r).exists():
        fail.append(f"index.html references missing file: {r}")
    else:
        print(f"  ok  {r}")

# 2. media.js parses and every path in it exists
manifest = load_manifest()
print(f"\nmedia.js: {len(manifest)} items")
LANGS = {"ru", "en", "ka"}
for i, item in enumerate(manifest):
    t = item.get("type")
    if t not in ("image", "video", "youtube"):
        fail.append(f"item {i}: bad type {t!r}")
    for key in ("src", "thumb", "poster"):
        p = item.get(key)
        if p and not (ROOT / p).exists():
            fail.append(f"item {i}: {key} missing on disk -> {p}")
    if t in ("image", "video") and not item.get("src"):
        fail.append(f"item {i}: type {t} needs 'src'")
    if t == "youtube" and not item.get("id"):
        fail.append(f"item {i}: type youtube needs 'id'")
    missing = LANGS - set((item.get("alt") or {}).keys())
    if missing:
        fail.append(f"item {i}: alt text missing for {sorted(missing)}")

# 3. the hard-coded hero in the HTML must be item 0, or the first paint is wrong
hero_src = re.search(r'<img src="(media/[^"]+)"', html)
if not hero_src or hero_src.group(1) != manifest[0]["src"]:
    fail.append(f"hero <img> ({hero_src and hero_src.group(1)}) != KOTIK_MEDIA[0] ({manifest[0]['src']})"
                "  -> update the <img> in index.html")
else:
    print(f"hero matches manifest[0]: {hero_src.group(1)}")

# 4. preload must point at the same file
pre = re.search(r'rel="preload"[^>]*href="([^"]+)"', html)
if not pre or pre.group(1) != manifest[0]["src"]:
    fail.append(f"preload ({pre and pre.group(1)}) != KOTIK_MEDIA[0]"
                "  -> update <link rel=preload> in index.html")
else:
    print(f"preload matches: {pre.group(1)}")

# 5. counter placeholder should match item count
cnt = re.search(r'id="gallery-counter"[^>]*>([^<]+)<', html)
if cnt and cnt.group(1).strip() != f"1 / {len(manifest)}":
    fail.append(f"counter placeholder {cnt.group(1).strip()!r} != '1 / {len(manifest)}'")

# 6. ids the loader needs
for need in ("gallery-stage", "gallery-thumbs", "gallery-counter", "gallery-prev", "gallery-next", "img"):
    if f'id="{need}"' not in html:
        fail.append(f"index.html is missing id={need}")

# 7. every TEXT_FIELDS id exists, and every key exists in all 3 languages
tf = re.search(r"const TEXT_FIELDS = \{(.*?)\};", html, re.S).group(1)
pairs = re.findall(r"'([\w-]+)':\s*'(\w+)'", tf)
for dom_id, key in pairs:
    if f'id="{dom_id}"' not in html:
        fail.append(f"TEXT_FIELDS maps {dom_id} but no such element")
blocks = dict(re.findall(r"\n            (ru|en|ka): \{(.*?)\n            \}", html, re.S))
keysets = {lang: set(re.findall(r"(\w+):\s*\"", body)) for lang, body in blocks.items()}
for lang, ks in keysets.items():
    print(f"lang {lang}: {len(ks)} keys")
for dom_id, key in pairs:
    for lang, ks in keysets.items():
        if key not in ks:
            fail.append(f"translations.{lang} missing key {key} (for #{dom_id})")
for extra in ("galleryPrev", "galleryNext"):
    for lang, ks in keysets.items():
        if extra not in ks:
            fail.append(f"translations.{lang} missing {extra}")
if keysets and len(set(map(frozenset, keysets.values()))) != 1:
    ref = keysets["ru"]
    for lang, ks in keysets.items():
        if ks != ref:
            fail.append(f"key mismatch {lang}: only-here={sorted(ks-ref)} missing={sorted(ref-ks)}")

# 8. nothing should still point at the deleted files
for dead in ("kotik_photo.jpg", "gal.js", "assets/1.jpg", "t.txt", "media.json"):
    if dead in html:
        fail.append(f"index.html still mentions deleted {dead}")

# 9. media.js must be loaded, and before gallery.js
i_media, i_gal = html.find('src="media.js"'), html.find('src="assets/gallery.js"')
if i_media == -1:
    fail.append("index.html never loads media.js")
elif i_gal != -1 and i_media > i_gal:
    fail.append("media.js must be loaded BEFORE assets/gallery.js")

print("\n" + ("FAIL\n" + "\n".join(" - " + f for f in fail) if fail else "ALL CHECKS PASSED"))
sys.exit(1 if fail else 0)
