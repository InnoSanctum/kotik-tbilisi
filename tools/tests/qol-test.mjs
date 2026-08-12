/* Slug generation, QR codes, and the shared tag/curator/donation catalogues. */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let fails = 0;
const check = (n, c, e = '') => {
  if (c) console.log(`  ok   ${n}`);
  else { console.log(`  FAIL ${n} ${e}`); fails++; }
};

/* Load a set of the site's scripts into a blank page. */
function boot(files, { url = 'https://x.org/index.html?lang=ru', withQrVendor = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously', url, pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const f of files) {
    const s = w.document.createElement('script');
    s.textContent = readFileSync(join(ROOT, f), 'utf8');
    w.document.head.appendChild(s);
    if (f === 'config.js') w.SITE_CONFIG.supabase = { url: '', anonKey: '' };
  }
  /* jsdom will not fetch the lazily-injected vendor script, so preload it. */
  if (withQrVendor) {
    const s = w.document.createElement('script');
    s.textContent = readFileSync(join(ROOT, 'assets/vendor/qrcode.js'), 'utf8');
    w.document.head.appendChild(s);
  }
  return w;
}

/* ------------------------------------------------------------- slugs --- */
console.log('\nSlug generation');
{
  const w = boot(['assets/slug.js']);
  const { slugify, unique, isValid } = w.PetSlug;

  check('Котик -> kotik', slugify('Котик') === 'kotik', slugify('Котик'));
  check('Барсик -> barsik', slugify('Барсик') === 'barsik', slugify('Барсик'));
  check('Рыжик -> ryzhik', slugify('Рыжик') === 'ryzhik', slugify('Рыжик'));
  check('Щенок -> shchenok', slugify('Щенок') === 'shchenok', slugify('Щенок'));
  check('Георгий -> georgiy', slugify('Георгий') === 'georgiy', slugify('Георгий'));
  check('Georgian კოტიკი -> kotiki', slugify('კოტიკი') === 'kotiki', slugify('კოტიკი'));
  check('spaces become dashes', slugify('Белый кот') === 'belyy-kot', slugify('Белый кот'));
  check('punctuation stripped', slugify('Bad Slug!!') === 'bad-slug', slugify('Bad Slug!!'));
  check('accents folded', slugify('Café') === 'cafe', slugify('Café'));
  check('leading/trailing dashes trimmed', slugify('  --Кот--  ') === 'kot', slugify('  --Кот--  '));
  check('runs collapse', slugify('a   ---   b') === 'a-b', slugify('a   ---   b'));
  check('empty input -> empty', slugify('') === '');
  check('unmappable input -> empty', slugify('日本語') === '', slugify('日本語'));
  check('length capped', slugify('a'.repeat(200)).length <= 60);

  check('every generated slug passes the DB constraint',
    ['Котик', 'Белый кот', 'Café', 'კოტიკი'].every((n) => isValid(slugify(n))));

  console.log('\nSlug uniqueness');
  check('no collision -> as-is', unique('Барсик', ['kotik']) === 'barsik');
  check('collision -> -2', unique('Барсик', ['barsik']) === 'barsik-2');
  check('two collisions -> -3', unique('Барсик', ['barsik', 'barsik-2']) === 'barsik-3');
  check('gap is reused', unique('Барсик', ['barsik', 'barsik-3']) === 'barsik-2');
  check('editing itself does not collide',
    unique('Барсик', ['barsik', 'kotik'], 'barsik') === 'barsik');
  check('unmappable name falls back to a valid stem', isValid(unique('日本語', [])));
  check('empty name falls back to "pet"', unique('', []) === 'pet');
  check('result is always valid',
    isValid(unique('Барсик', ['barsik', 'barsik-2', 'barsik-3'])));
}

/* --------------------------------------------------------------- QR --- */
console.log('\nQR codes');
{
  const w = boot(['assets/qr.js'], { withQrVendor: true });
  const box = w.document.createElement('div');
  w.document.body.appendChild(box);

  const svg = await w.PetQR.render(box, 'https://egreve.bog.ge/For_Kotik', { label: 'Donate' });
  check('renders an <svg>', !!svg && svg.tagName.toLowerCase() === 'svg');
  check('svg is in the container', box.querySelector('svg') !== null);
  check('labelled for screen readers', svg.getAttribute('aria-label') === 'Donate');
  check('marked role=img', svg.getAttribute('role') === 'img');
  check('scales to its box, not a fixed size',
    !svg.hasAttribute('width') && svg.style.width === '100%');
  check('has a viewBox so it stays sharp', svg.hasAttribute('viewBox'));
  check('draws actual modules', box.querySelectorAll('path, rect').length > 0);

  /* A different URL must produce a different code — a stale QR pointing at the
     wrong donation page is the failure that matters here. */
  const box2 = w.document.createElement('div');
  await w.PetQR.render(box2, 'https://example.org/other');
  check('different text -> different code', box.innerHTML !== box2.innerHTML);

  const box3 = w.document.createElement('div');
  box3.textContent = 'stale';
  const none = await w.PetQR.render(box3, '');
  check('empty text renders nothing', none === null && box3.textContent === '');

  const markup = await w.PetQR.svgMarkup('https://egreve.bog.ge/For_Kotik');
  check('svgMarkup returns standalone SVG', /^<svg[\s\S]*<\/svg>$/.test(markup.trim()));

  check('unicode URLs encode without throwing',
    (await w.PetQR.svgMarkup('https://пример.рф/помощь')).length > 100);
}

/* ------------------------------------------------- catalogue resolution */
console.log('\nShared catalogues');
{
  const w = boot(['config.js', 'assets/i18n.js', 'data/pets.js', 'assets/slug.js', 'assets/db.js']);
  const DB = w.PetDB;

  const cat = DB.seedCatalogues();
  check('tags seeded', cat.tags.length >= 6, `${cat.tags.length}`);
  check('curators seeded', cat.curators.length === 1);
  check('donations seeded', cat.donations.length === 1);

  const [kotik] = DB.seedPets(true);
  check('pet resolves tag labels from the catalogue',
    kotik.tags.find((t) => t.id === 'fiv').ru === 'ВИК (FIV) +',
    JSON.stringify(kotik.tags.find((t) => t.id === 'fiv')));
  check('all six tags resolved', kotik.tags.length === 6, `${kotik.tags.length}`);
  check('curatorSlug resolved to the curator',
    w.I18N.pick(kotik.curator.name, 'ru') === 'Михаил (Михайло)');
  check('curator contacts resolved', kotik.curator.telegram === 'https://t.me/innosanctum');
  check('donationSlug resolved to the link',
    kotik.donate.url === 'https://egreve.bog.ge/For_Kotik');
  check("bank's QR preserved over generation", kotik.donate.qr === 'assets/qr_code.png');
  check('donation note resolved',
    w.I18N.pick(kotik.donate.note, 'ru').includes('Любая сумма'));

  const ctx = DB.buildContext(cat);

  check('bare string matching a catalogue id resolves to that tag',
    DB.normaliseTag('fiv', 0, ctx.tags).ru === 'ВИК (FIV) +');
  check('bare string not in the catalogue is treated as a label',
    DB.normaliseTag('Пушистый', 0, ctx.tags).ru === 'Пушистый');
  check('...and gets a transliterated id',
    DB.normaliseTag('Пушистый', 0, ctx.tags).id === 'pushistyy',
    DB.normaliseTag('Пушистый', 0, ctx.tags).id);
  check('catalogue label wins over a stale inline one',
    DB.normaliseTag({ id: 'fiv', ru: 'старое' }, 0, ctx.tags).ru === 'ВИК (FIV) +');
  check('inline label kept when the catalogue has no such tag',
    DB.normaliseTag({ id: 'unknown', ru: 'своё' }, 0, ctx.tags).ru === 'своё');

  console.log('\nForeign keys');
  const petRow = {
    slug: 'x', published: true, sort_order: 1,
    curator_id: 'c-1', donation_id: 'd-1',
    tag_ids: ['fiv'],
    doc: { name: { ru: 'Тест' }, tags: ['fiv'] },
  };
  const ctx2 = DB.buildContext({
    tags: cat.tags,
    curators: [{ id: 'c-1', slug: 'someone', name: { ru: 'Куратор' }, telegram: 'https://t.me/x' }],
    donations: [{ id: 'd-1', slug: 'link', url: 'https://pay.example', label: { ru: 'Помочь' } }],
  });
  const resolved = DB.normalisePet(petRow, ctx2);
  check('curator_id resolves', w.I18N.pick(resolved.curator.name, 'ru') === 'Куратор');
  check('donation_id resolves', resolved.donate.url === 'https://pay.example');
  check('ids kept for the admin to reselect',
    resolved.curatorId === 'c-1' && resolved.donationId === 'd-1');
  check('tag id resolves against the catalogue', resolved.tags[0].ru === 'ВИК (FIV) +');

  const missing = DB.normalisePet(
    { slug: 'y', curator_id: 'nope', doc: { name: { ru: 'Т' } } }, ctx2);
  check('dangling curator_id degrades to an empty curator',
    missing.curator && w.I18N.pick(missing.curator.name) === '');

  console.log('\ntoRow');
  const row = DB.toRow(kotik);
  check('tag_ids are ids only',
    JSON.stringify(row.tag_ids) === JSON.stringify(['cat', 'young', 'calm', 'fiv', 'tbilisi', 'needs-home']),
    JSON.stringify(row.tag_ids));
  check('doc.tags are ids only',
    row.doc.tags.every((t) => typeof t === 'string'));
  check('curator is not duplicated into doc', row.doc.curator === undefined);
  check('donation is not duplicated into doc', row.doc.donate === undefined);
  check('mainPhoto IS persisted', !!(row.doc.mainPhoto && row.doc.mainPhoto.src),
    JSON.stringify(row.doc.mainPhoto));
  check('story still present', row.doc.description.ru.length > 1500);

  /* Regression: a pet whose only photo is the main one used to lose it on
     save, because toRow() dropped mainPhoto assuming gallery[0] could rebuild
     it. With an empty gallery there is nothing to rebuild from. */
  console.log('\nMain photo with no gallery (regression)');
  const onlyMain = {
    slug: 'tayra', published: true, sortOrder: 3,
    name: { ru: 'Тайра' }, subtitle: {}, location: {}, status: {}, statusType: 'info',
    tags: [], gallery: [],
    mainPhoto: { type: 'image', src: 'https://cdn.example/tayra.jpg', thumb: '', alt: { ru: 'Тайра' } },
    shortDescription: {}, description: {},
    video: { type: 'video', src: 'https://cdn.example/tayra.mp4', thumb: '', alt: {} },
    carePlan: [], docs: [], sections: [],
    donate: { slug: '', url: '', qr: '', label: {}, note: {} },
    curator: { slug: '', name: {}, bio: {}, photoAlt: {} },
  };
  const onlyMainRow = DB.toRow(onlyMain);
  check('the single photo survives toRow',
    onlyMainRow.doc.mainPhoto && onlyMainRow.doc.mainPhoto.src === 'https://cdn.example/tayra.jpg',
    JSON.stringify(onlyMainRow.doc.mainPhoto));

  const reloaded = DB.normalisePet(onlyMainRow, ctx);
  check('card image survives the round trip',
    reloaded.mainPhoto && reloaded.mainPhoto.src === 'https://cdn.example/tayra.jpg',
    JSON.stringify(reloaded.mainPhoto));
  check('it also becomes the first gallery slide',
    reloaded.gallery.length === 1 && reloaded.gallery[0].src === 'https://cdn.example/tayra.jpg',
    `${reloaded.gallery.length} slides`);
  check('the video is kept alongside it',
    reloaded.video && reloaded.video.src === 'https://cdn.example/tayra.mp4');

  /* Saving twice must not accumulate duplicate slides. */
  const twice = DB.normalisePet(DB.toRow(reloaded), ctx);
  check('re-saving does not duplicate the photo',
    twice.gallery.length === 1, `${twice.gallery.length} slides`);

  /* Round-trip: the row must render back to the same thing. */
  const back = DB.normalisePet(row, ctx);
  check('round-trips the name', w.I18N.pick(back.name, 'ru') === 'Котик');
  check('round-trips the gallery', back.gallery.length === 7, `${back.gallery.length}`);
  check('round-trips tag labels', back.tags[3].ru === 'ВИК (FIV) +');
}

/* ------------------------------------------- legacy inline records still work */
console.log('\nBackwards compatibility');
{
  const w = boot(['config.js', 'assets/i18n.js', 'data/pets.js', 'assets/slug.js', 'assets/db.js']);
  const DB = w.PetDB;
  const legacy = DB.normalisePet({
    slug: 'old',
    doc: {
      name: { ru: 'Старый' },
      tags: [{ id: 'x', ru: 'Тег' }],
      curator: { name: { ru: 'Инлайн' }, email: 'a@b.c' },
      donate: { url: 'https://old', qr: 'old.png' },
    },
  }, DB.buildContext(DB.seedCatalogues()));
  check('inline curator still renders', w.I18N.pick(legacy.curator.name, 'ru') === 'Инлайн');
  check('inline donation still renders', legacy.donate.url === 'https://old');
  check('inline tag still renders', legacy.tags[0].ru === 'Тег');
}

console.log(fails === 0 ? '\nAll QoL tests passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
