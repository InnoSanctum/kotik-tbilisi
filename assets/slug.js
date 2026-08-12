/*
 * Slugs.
 *
 * A slug is the pet's address (pet.html?slug=kotik) and its primary key in the
 * database, so it must be lowercase latin, digits and dashes — Postgres
 * rejects anything else (see the check constraint in supabase/schema.sql).
 *
 * Names are written in Russian, so "Котик" has to become "kotik" rather than
 * percent-encoded mush. Georgian is transliterated too; anything left over
 * (Chinese, emoji, an empty name) falls back to a generic stem so the admin
 * always has something valid to offer.
 *
 * Transliteration only ever has to be *stable and readable*, not reversible —
 * nothing is ever converted back.
 */
(function () {
  'use strict';

  /* Russian. Mostly the BGN/PCGN convention, which is what a Russian speaker
     expects to see in a URL: ш -> sh, ч -> ch, ю -> yu. */
  var CYRILLIC = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e',
    ю: 'yu', я: 'ya',
    /* Ukrainian letters, since the curator writes both languages. */
    і: 'i', ї: 'yi', є: 'ye', ґ: 'g'
  };

  /* Georgian (mkhedruli), national transliteration. */
  var GEORGIAN = {
    ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't',
    ი: 'i', კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh',
    რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q',
    შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh',
    ჯ: 'j', ჰ: 'h'
  };

  function transliterate(text) {
    var out = '';
    var lower = String(text).toLowerCase();
    for (var i = 0; i < lower.length; i++) {
      var ch = lower[i];
      if (CYRILLIC[ch] !== undefined) out += CYRILLIC[ch];
      else if (GEORGIAN[ch] !== undefined) out += GEORGIAN[ch];
      else out += ch;
    }
    return out;
  }

  /*
   * Text -> slug. Returns '' when nothing usable survives, so callers can
   * decide on their own fallback rather than being handed a meaningless stem.
   */
  function slugify(text) {
    if (!text) return '';

    var out = transliterate(text);

    /* Strip accents: "Café" -> "cafe" rather than "caf". */
    if (out.normalize) out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');

    return out
      .replace(/[^a-z0-9]+/g, '-')   // everything else becomes a separator
      .replace(/^-+|-+$/g, '')       // no leading or trailing dashes
      .replace(/-{2,}/g, '-')        // collapse runs
      .slice(0, 60);                 // keep URLs and the DB column sane
  }

  /*
   * Make `base` unique against `taken`.
   *
   * Two cats called Барсик both want "barsik"; the second becomes "barsik-2".
   * Numeric rather than random so the result is predictable and the curator
   * can guess the URL — and so re-running it never invents a third variant.
   *
   * `ignore` is the slug the record already has, so re-generating a slug while
   * editing an existing pet does not collide with itself.
   */
  function unique(base, taken, ignore) {
    var stem = slugify(base) || 'pet';
    var used = {};
    (taken || []).forEach(function (slug) {
      if (slug && slug !== ignore) used[slug] = true;
    });

    if (!used[stem]) return stem;

    /* Cap the loop: a name colliding 999 times means something is wrong, and
       an unbounded while() in a browser is how a page hangs forever. */
    for (var n = 2; n < 1000; n++) {
      var candidate = stem + '-' + n;
      if (!used[candidate]) return candidate;
    }
    return stem + '-' + Date.now();
  }

  function isValid(slug) {
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '');
  }

  window.PetSlug = {
    slugify: slugify,
    unique: unique,
    isValid: isValid,
    transliterate: transliterate
  };
})();
