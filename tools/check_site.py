#!/usr/bin/env python3
"""
Pre-flight check for the site. Run it before pushing:

    python tools/check_site.py

Catches the mistakes that are easy to make and hard to see:

  * a typo in data/pets.js (missing comma / quote) that would blank the site
  * a photo, QR code, or document path that does not exist on disk
  * a pet with no name, no slug, or a slug that will not survive a URL
  * a duplicate slug, which would make one of the two pets unreachable
  * a tag id that is missing, so the tag filter silently drops it
  * a missing Russian translation — Russian is the fallback every other
    language degrades to, so a gap there shows up as an empty element
  * a page whose <script> tags are out of order or incomplete
  * placeholder junk (lorem ipsum, the Rickroll video id) left in real data

Exit code is 0 when everything passes, 1 otherwise, so it works in CI.
Requires nothing outside the standard library.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FALLBACK_LANG = "ru"
LANGS = ("ru", "en", "ka")

# Text fields that must at minimum exist in the fallback language.
REQUIRED_LOCALISED = ("name", "subtitle", "shortDescription", "description")

# Things that mean "someone forgot to replace the placeholder".
PLACEHOLDERS = {
    "dQw4w9WgXcQ": "the Rickroll YouTube id",
    "lorem ipsum": "lorem ipsum filler",
    "example.com": "an example.com URL",
    "TODO": "a TODO marker",
}

problems: list[str] = []
notes: list[str] = []


def fail(message: str) -> None:
    problems.append(message)


def note(message: str) -> None:
    notes.append(message)


# --------------------------------------------------------------- load data

def load_pets():
    """
    data/pets.js is JavaScript, not JSON, so it is evaluated by Node rather
    than parsed here. Node is already required by tools/make_seed.mjs.
    """
    script = (
        "const vm=require('node:vm'),fs=require('node:fs');"
        "const s={window:{}};"
        "vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),s);"
        "process.stdout.write(JSON.stringify("
        "{pets:s.window.PETS_SEED,content:s.window.SITE_CONTENT}));"
    )
    try:
        # encoding is explicit: the records are Russian and Georgian, and on a
        # Windows console `text=True` would otherwise decode them as cp1251
        # and blow up before the first check runs.
        out = subprocess.run(
            ["node", "-e", script, str(ROOT / "data" / "pets.js")],
            capture_output=True, text=True, timeout=30,
            encoding="utf-8", errors="replace",
        )
    except FileNotFoundError:
        fail("Node.js is not installed or not on PATH — needed to read data/pets.js")
        return None, None

    if out.returncode != 0:
        # Node's own message names the line and column of the syntax error.
        detail = (out.stderr or "").strip().splitlines()
        head = "\n     ".join(detail[:6]) if detail else "unknown error"
        fail(f"data/pets.js does not parse:\n     {head}")
        return None, None

    data = json.loads(out.stdout)
    return data.get("pets"), data.get("content")


# ------------------------------------------------------------- validation

def check_file(path: str, where: str) -> None:
    """Local paths must exist; remote URLs are taken on trust."""
    if not path or path.startswith(("http://", "https://", "data:")):
        return
    if not (ROOT / path).exists():
        fail(f"{where}: file not found on disk — {path}")


def check_localised(value, field: str, where: str, required: bool = True) -> None:
    if not isinstance(value, dict):
        if required:
            fail(f"{where}: {field} should be a {{lang: text}} object, got {type(value).__name__}")
        return
    if required and not value.get(FALLBACK_LANG):
        fail(f"{where}: {field} has no '{FALLBACK_LANG}' text "
             f"(Russian is the fallback — without it this renders empty)")
    for lang in value:
        # 'id' rides along inside tag objects as the stable filter key, so it
        # is structure rather than a translation.
        if lang not in LANGS and lang != "id":
            note(f"{where}: {field} has extra language '{lang}' "
                 f"(fine — it renders for visitors using it)")


def scan_placeholders(blob: str, where: str) -> None:
    lowered = blob.lower()
    for needle, description in PLACEHOLDERS.items():
        if needle.lower() in lowered:
            fail(f"{where}: contains {description} ({needle!r})")


def check_pet(pet, index: int) -> None:
    slug = pet.get("slug", "")
    where = f"pet #{index + 1} ({slug or 'no slug'})"

    if not slug:
        fail(f"{where}: missing slug")
    elif not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        fail(f"{where}: slug {slug!r} must be lowercase letters, digits and single dashes "
             f"(it goes straight into the URL, and Postgres rejects anything else)")

    for field in REQUIRED_LOCALISED:
        check_localised(pet.get(field), field, where)

    for field in ("location", "status"):
        check_localised(pet.get(field), field, where, required=False)

    # --- tags
    tags = pet.get("tags") or []
    seen_tags = set()
    for i, tag in enumerate(tags):
        if isinstance(tag, str):
            continue
        tag_id = tag.get("id")
        if not tag_id:
            fail(f"{where}: tag #{i + 1} has no id — the filter needs a stable key")
        elif tag_id in seen_tags:
            fail(f"{where}: duplicate tag id {tag_id!r}")
        else:
            seen_tags.add(tag_id)
        check_localised(tag, "tag label", f"{where} tag {tag_id or i + 1}", required=False)

    # --- media
    main = pet.get("mainPhoto")
    if not main or not main.get("src"):
        fail(f"{where}: no mainPhoto — the card will render with an empty image box")
    else:
        check_file(main["src"], f"{where} mainPhoto")
        check_file(main.get("thumb"), f"{where} mainPhoto thumb")
        check_localised(main.get("alt"), "mainPhoto.alt", where, required=False)

    gallery = pet.get("gallery") or []
    if not gallery:
        note(f"{where}: gallery is empty")
    for i, item in enumerate(gallery):
        kind = item.get("type", "image")
        spot = f"{where} gallery #{i + 1}"
        if kind == "youtube":
            if not item.get("id"):
                fail(f"{spot}: youtube item has no video id")
        else:
            if not item.get("src"):
                fail(f"{spot}: no src")
            check_file(item.get("src"), spot)
        check_file(item.get("thumb"), f"{spot} thumb")
        check_localised(item.get("alt"), "alt", spot, required=False)

    video = pet.get("video")
    if video:
        if video.get("type") == "youtube" and not video.get("id"):
            fail(f"{where}: video block has no YouTube id — set video to null to hide the section")
        check_file(video.get("thumb"), f"{where} video poster")

    # --- donation
    donate = pet.get("donate") or {}
    if not donate.get("url") and not donate.get("qr"):
        note(f"{where}: no donation link or QR code")
    check_file(donate.get("qr"), f"{where} donate QR")
    if donate.get("url") and not donate["url"].startswith("https://"):
        fail(f"{where}: donation link is not https — {donate['url']}")

    # --- documents
    for i, doc in enumerate(pet.get("docs") or []):
        spot = f"{where} doc #{i + 1}"
        if not doc.get("href"):
            fail(f"{spot}: no href")
        check_file(doc.get("href"), spot)
        check_localised(doc.get("label"), "label", spot, required=False)

    # --- curator
    curator = pet.get("curator") or {}
    check_file(curator.get("photo"), f"{where} curator photo")
    if not any(curator.get(k) for k in ("email", "telegram", "instagram", "phone")):
        note(f"{where}: curator has no contact details")

    for i, step in enumerate(pet.get("carePlan") or []):
        spot = f"{where} care step #{i + 1}"
        if step.get("state") not in ("done", "needed"):
            fail(f"{spot}: state must be 'done' or 'needed', got {step.get('state')!r}")
        check_localised(step.get("title"), "title", spot, required=False)

    for i, section in enumerate(pet.get("sections") or []):
        spot = f"{where} section #{i + 1}"
        check_localised(section.get("title"), "title", spot, required=False)
        check_localised(section.get("body"), "body", spot, required=False)

    scan_placeholders(json.dumps(pet, ensure_ascii=False), where)


# ------------------------------------------------------------------ pages

# Load order matters: config defines SITE_CONFIG, i18n reads it, db reads both.
PAGE_SCRIPTS = {
    "index.html": ["config.js", "assets/i18n.js", "data/pets.js",
                   "assets/db.js", "assets/ui.js", "assets/home.js"],
    "pet.html":   ["config.js", "assets/i18n.js", "data/pets.js",
                   "assets/db.js", "assets/ui.js", "assets/gallery.js", "assets/pet.js"],
    "admin.html": ["config.js", "assets/i18n.js", "data/pets.js", "assets/auth.js",
                   "assets/db.js", "assets/ui.js", "assets/admin.js"],
}

# Element ids each page's renderer looks up by hand.
REQUIRED_IDS = {
    "index.html": ["hero-title", "hero-subtitle", "hero-image", "about-title",
                   "about-body", "search-input", "tag-filters", "pet-list",
                   "result-count", "contacts-title", "contacts-body", "contacts-links"],
    "pet.html":   ["pet-article", "pet-missing", "pet-gallery", "pet-donate",
                   "pet-badges", "pet-name", "pet-subtitle", "pet-tags",
                   "pet-story", "pet-care", "pet-docs", "pet-video",
                   "pet-sections", "pet-curator"],
    "admin.html": ["not-configured", "auth-wrap", "app-wrap", "sign-in-form",
                   "admin-email", "admin-password", "auth-error", "sign-out",
                   "admin-who", "admin-list", "list-wrap", "admin-editor",
                   "editor-wrap", "admin-status", "new-pet", "export-seed"],
}


def check_page(name: str) -> None:
    path = ROOT / name
    if not path.exists():
        fail(f"{name} is missing")
        return

    html = path.read_text(encoding="utf-8")

    for element_id in REQUIRED_IDS[name]:
        if f'id="{element_id}"' not in html:
            fail(f"{name}: no element with id={element_id!r} — the renderer looks it up by hand")

    found = re.findall(r'<script src="([^"]+)"', html)
    for script in PAGE_SCRIPTS[name]:
        if script not in found:
            fail(f"{name}: does not load {script}")
    ordered = [s for s in found if s in PAGE_SCRIPTS[name]]
    expected = [s for s in PAGE_SCRIPTS[name] if s in ordered]
    if ordered != expected:
        fail(f"{name}: scripts are out of order.\n"
             f"     found:    {ordered}\n     expected: {expected}")

    # Local assets referenced straight from the markup.
    for ref in re.findall(r'(?:src|href)="([^"#?]+)"', html):
        if ref.startswith(("http", "//", "mailto:", "tel:", "data:", "#")):
            continue
        if ref.endswith((".html",)):
            continue
        if not (ROOT / ref).exists():
            fail(f"{name}: references a missing file — {ref}")


def strip_js_comments(text: str) -> str:
    """Comments are prose and routinely mention the very things we grep for."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"^\s*//.*$", "", text, flags=re.M)


def check_config() -> None:
    text = (ROOT / "config.js").read_text(encoding="utf-8")
    code = strip_js_comments(text)

    # A service_role key here would be handed to every visitor. Checked against
    # comment-stripped source, since config.js documents this exact hazard.
    if re.search(r"service_?[rR]ole", code):
        fail("config.js looks like it contains a service_role key — it is public, "
             "use the anon key only")

    # service_role JWTs carry "role":"service_role"; spotting the decoded claim
    # catches a key pasted into the anonKey slot by mistake.
    for token in re.findall(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", code):
        import base64
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        try:
            claims = base64.urlsafe_b64decode(payload).decode("utf-8", "replace")
        except Exception:
            continue
        if "service_role" in claims:
            fail("config.js contains a service_role JWT — that key bypasses row "
                 "level security and must never reach the browser")
    if re.search(r"url:\s*'https://[a-z0-9]+\.supabase\.co'", text):
        note("config.js has a Supabase project configured — the site will read live data")
    else:
        note("config.js has no Supabase project — the site renders from data/pets.js")


# ------------------------------------------------------------------- main

def main() -> int:
    pets, content = load_pets()

    if pets is None:
        report()
        return 1

    if not isinstance(pets, list) or not pets:
        fail("data/pets.js defines no pets")
        report()
        return 1

    print(f"data/pets.js: {len(pets)} pet(s)")

    slugs: dict[str, int] = {}
    for i, pet in enumerate(pets):
        check_pet(pet, i)
        slug = pet.get("slug")
        if slug:
            if slug in slugs:
                fail(f"duplicate slug {slug!r} (pets #{slugs[slug] + 1} and #{i + 1}) — "
                     f"only one of them would ever be reachable")
            slugs[slug] = i

    published = [p for p in pets if p.get("published")]
    print(f"  published: {len(published)}  draft: {len(pets) - len(published)}")
    if not published:
        fail("no pet is published — the main page would show an empty list")

    if content:
        for block in ("hero", "about", "contacts"):
            section = content.get(block) or {}
            for field in ("title", "subtitle", "body"):
                if field in section:
                    check_localised(section[field], field, f"SITE_CONTENT.{block}", required=False)
        hero_image = (content.get("hero") or {}).get("image")
        check_file(hero_image, "SITE_CONTENT.hero.image")

        # The hero photo is duplicated in index.html — once as <img src> and
        # once as <link rel=preload> — so it starts downloading with the page
        # instead of waiting for JavaScript. Change the hero and those two
        # lines go stale silently: the browser then fetches the old photo
        # eagerly and the new one late, which is worse than no preload at all.
        if hero_image:
            html = (ROOT / "index.html").read_text(encoding="utf-8")
            preload = re.search(r'<link rel="preload" as="image" href="([^"]+)"', html)
            if not preload:
                note("index.html has no <link rel=preload> for the hero image")
            elif preload.group(1) != hero_image:
                fail(f"index.html preloads {preload.group(1)!r} but SITE_CONTENT.hero.image "
                     f"is {hero_image!r} — update the <link rel=preload> in index.html")

            hero_img = re.search(r'<img id="hero-image" src="([^"]+)"', html)
            if hero_img and hero_img.group(1) != hero_image:
                fail(f"index.html hero <img> is {hero_img.group(1)!r} but "
                     f"SITE_CONTENT.hero.image is {hero_image!r} — update the <img> in index.html")
    else:
        note("data/pets.js defines no window.SITE_CONTENT — the main page falls back to UI strings")

    for page in PAGE_SCRIPTS:
        check_page(page)

    check_config()

    report()
    return 1 if problems else 0


def report() -> None:
    if notes:
        print("\nNotes:")
        for message in notes:
            print(f"  - {message}")

    if problems:
        print(f"\nFAIL — {len(problems)} problem(s):")
        for message in problems:
            print(f"  ! {message}")
    else:
        print("\nOK — everything checks out.")


if __name__ == "__main__":
    sys.exit(main())
