/* Data layer: DB-row normalisation, Supabase fetch, fallback, multi-pet render. */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';
/* Repo root, derived from this file so the suite runs from anywhere. */
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* body.textContent would otherwise include the source of every injected
   <script>, so assertions must run against rendered text only. */
function visibleText(doc) {
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  return clone.textContent;
}

let fails = 0;
const check = (n, c, e = '') => {
  if (c) console.log(`  ok   ${n}`);
  else { console.log(`  FAIL ${n} ${e}`); fails++; }
};

function boot(opts = {}) {
  const url = opts.url || 'https://x.org/index.html?lang=ru';
  const page = opts.page || 'index.html';
  const dom = new JSDOM(readFileSync(join(ROOT, page), 'utf8'), {
    runScripts: 'dangerously', url, pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  for (const tag of [...d.querySelectorAll('script[src]')]) {
    const f = tag.getAttribute('src');
    const s = d.createElement('script');
    s.textContent = readFileSync(join(ROOT, f), 'utf8');
    d.head.appendChild(s);
    if (f === 'config.js') {
      /* Default to "no project configured" so the seed path is exercised
         deterministically, whatever config.js happens to contain. */
      w.SITE_CONFIG.supabase = opts.supabase || { url: '', anonKey: '' };
      if (opts.fetchImpl) w.fetch = opts.fetchImpl;
    }
    if (f === 'data/pets.js' && opts.extraSeed) w.PETS_SEED.push(...opts.extraSeed);
  }
  d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, d };
}

const settle = () => new Promise((r) => setTimeout(r, 200));

/* ---- normalisePet on a Postgres-shaped row (snake_case + doc jsonb) ---- */
console.log('\nnormalisePet: database row shape');
{
  const { w } = boot({});
  const row = {
    slug: 'barsik', published: true, sort_order: 5, tag_ids: ['dog'],
    doc: {
      name: { ru: 'Барсик' }, subtitle: { ru: 'Пёс' },
      tags: [{ id: 'dog', ru: 'Собака' }, 'Стерилизован'],
      gallery: [{ type: 'image', src: 'a.webp' }, { type: 'image', src: 'b.webp', thumb: 'bt.webp' }],
      mainPhoto: { src: 'a.webp' },
      care_plan: [{ state: 'done', title: { ru: 'Осмотр' } }],
      short_description: 'просто строка',
      donate: { url: 'https://x' }, curator: { name: { ru: 'Кто-то' } },
    },
  };
  const p = w.PetDB.normalisePet(row);
  check('slug from column', p.slug === 'barsik');
  check('sortOrder from snake_case column', p.sortOrder === 5);
  check('published from column', p.published === true);
  check('name from doc', p.name.ru === 'Барсик');
  check('bare-string field becomes a {ru} map', p.shortDescription.ru === 'просто строка');
  check('care_plan snake_case accepted', p.carePlan.length === 1 && p.carePlan[0].state === 'done');
  check('string tag gets a generated id', !!p.tags[1].id, p.tags[1].id);
  check('object tag keeps its id', p.tags[0].id === 'dog');
  check('missing thumb defaults to src', p.gallery[0].thumb === 'a.webp');
  check('mainPhoto not duplicated in gallery',
    p.gallery.filter((g) => g.src === 'a.webp').length === 1, `${p.gallery.length} items`);
  check('gallery length correct', p.gallery.length === 2, `${p.gallery.length}`);

  const p2 = w.PetDB.normalisePet({ slug: 'x', doc: { mainPhoto: { src: 'main.webp' }, gallery: [{ type: 'image', src: 'g1.webp' }] } });
  check('main photo prepended when not in gallery', p2.gallery.length === 2 && p2.gallery[0].src === 'main.webp');

  const p3 = w.PetDB.normalisePet({ slug: 'x', doc: { gallery: [{ type: 'image', src: 'g1.webp' }] } });
  check('mainPhoto derives from gallery[0]', p3.mainPhoto && p3.mainPhoto.src === 'g1.webp');

  const p4 = w.PetDB.normalisePet({ slug: 'x', doc: { video: { type: 'youtube', id: '' } } });
  check('empty video normalises to null', p4.video === null);
}

/* ---- toRow round-trip ---- */
console.log('\ntoRow: renderer shape -> database row');
{
  const { w } = boot({});
  const pet = w.PetDB.seedPets()[0];
  const row = w.PetDB.toRow(pet);
  check('slug is a column', row.slug === 'kotik');
  check('published is a column', row.published === true);
  check('sort_order is snake_case', row.sort_order === 1);
  check('tag_ids extracted for indexing',
    JSON.stringify(row.tag_ids) === JSON.stringify(['cat', 'young', 'calm', 'fiv', 'tbilisi', 'needs-home']),
    JSON.stringify(row.tag_ids));
  check('doc has no duplicated slug', row.doc.slug === undefined);
  check('doc keeps the story', row.doc.description.ru.length > 1000);
  const back = w.PetDB.normalisePet(row);
  check('round-trips back to the same name', back.name.ru === 'Котик');
  check('round-trips the gallery', back.gallery.length === 7, `${back.gallery.length}`);
}

/* ---- live Supabase read ---- */
console.log('\nSupabase read (stubbed REST)');
{
  let seenUrl = null, seenHeaders = null;
  const fetchImpl = async (url, opts) => {
    seenUrl = url; seenHeaders = opts.headers;
    return {
      ok: true, status: 200,
      json: async () => ([{
        slug: 'remote-cat', published: true, sort_order: 1, tag_ids: ['x'],
        doc: {
          name: { ru: 'Из базы' }, subtitle: { ru: 's' }, shortDescription: { ru: 'd' },
          gallery: [{ type: 'image', src: 'media/kotik-2026-03-12.webp' }],
          tags: [{ id: 'x', ru: 'Тег' }],
        },
      }]),
    };
  };
  const { d } = boot({ supabase: { url: 'https://demo.supabase.co', anonKey: 'anon-key-123' }, fetchImpl });
  await settle();
  check('requests the pets table', /\/rest\/v1\/pets\?/.test(seenUrl || ''), seenUrl);
  check('filters to published rows', (seenUrl || '').includes('published=eq.true'));
  check('orders by sort_order', (seenUrl || '').includes('order=sort_order.asc'));
  check('sends the anon apikey header', seenHeaders && seenHeaders.apikey === 'anon-key-123');
  check('renders the row from the database', visibleText(d).includes('Из базы'));
  check('does NOT render the local seed', !visibleText(d).includes('Котик'));
  check('no stale banner on success', d.getElementById('site-banner').hidden === true);
}

/* ---- Supabase down -> falls back to the seed ---- */
console.log('\nSupabase unreachable -> static fallback');
{
  const fetchImpl = async () => { throw new Error('network down'); };
  const { d } = boot({ supabase: { url: 'https://demo.supabase.co', anonKey: 'k' }, fetchImpl });
  await settle();
  check('still renders the seed', visibleText(d).includes('Котик'));
  check('shows a stale-data banner', d.getElementById('site-banner').hidden === false);
  check('banner explains why', /недоступна/i.test(d.getElementById('site-banner').textContent));
}

/* ---- HTTP error also falls back ---- */
console.log('\nSupabase 500 -> static fallback');
{
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const { d } = boot({ supabase: { url: 'https://demo.supabase.co', anonKey: 'k' }, fetchImpl });
  await settle();
  check('renders the seed on a 500', visibleText(d).includes('Котик'));
}

/* ---- multi-pet: grid, filtering, drafts ---- */
console.log('\nMulti-pet behaviour');
{
  const extra = [
    {
      slug: 'barsik', published: true, sortOrder: 2, name: { ru: 'Барсик', en: 'Barsik' },
      subtitle: { ru: 'Пёс' }, shortDescription: { ru: 'Описание' }, description: { ru: 'Текст' },
      tags: [{ id: 'dog', ru: 'Собака' }, { id: 'tbilisi', ru: 'Тбилиси' }],
      mainPhoto: { src: 'media/kotik-2025-11-06.webp', alt: { ru: 'a' } },
      gallery: [{ type: 'image', src: 'media/kotik-2025-11-06.webp' }],
      donate: {}, curator: {}, docs: [], carePlan: [], sections: [],
    },
    {
      slug: 'hidden', published: false, sortOrder: 3, name: { ru: 'Черновик' },
      subtitle: {}, shortDescription: {}, description: {}, tags: [],
      mainPhoto: { src: 'media/kotik-2025-11-16.webp' }, gallery: [],
      donate: {}, curator: {}, docs: [], carePlan: [], sections: [],
    },
  ];
  const { w, d } = boot({ extraSeed: extra });
  await settle();
  check('renders 2 published cards', d.querySelectorAll('.pet-card').length === 2,
    `${d.querySelectorAll('.pet-card').length}`);
  check('draft is not shown', !visibleText(d).includes('Черновик'));
  check('both names present',
    visibleText(d).includes('Котик') && visibleText(d).includes('Барсик'));

  const pills = [...d.querySelectorAll('.filter-pill')];
  const tbilisi = pills.find((p) => p.textContent.startsWith('Тбилиси'));
  check('shared tag shows a count of 2', tbilisi && tbilisi.textContent.includes('2'),
    tbilisi && tbilisi.textContent);

  const dog = pills.find((p) => p.textContent.startsWith('Собака'));
  dog.dispatchEvent(new w.Event('click', { bubbles: true }));
  check('filtering by "Собака" leaves 1 card', d.querySelectorAll('.pet-card').length === 1);
  check('the remaining card is Барсик', d.querySelector('.pet-card').textContent.includes('Барсик'));

  const tb = [...d.querySelectorAll('.filter-pill')].find((p) => p.textContent.startsWith('Тбилиси'));
  tb.dispatchEvent(new w.Event('click', { bubbles: true }));
  check('two tags AND together', d.querySelectorAll('.pet-card').length === 1);

  const fiv = [...d.querySelectorAll('.filter-pill')].find((p) => p.textContent.startsWith('ВИК'));
  fiv.dispatchEvent(new w.Event('click', { bubbles: true }));
  check('contradictory tags yield the empty state', d.querySelectorAll('.empty-state').length === 1);
}

/* ---- ?tag= deep link ---- */
console.log('\n?tag= deep link from a pet page');
{
  const { d } = boot({ url: 'https://x.org/index.html?lang=ru&tag=fiv' });
  await settle();
  check('opens pre-filtered', d.querySelectorAll('.pet-card').length === 1);
  const active = [...d.querySelectorAll('.filter-pill.active')];
  check('the tag pill shows as active', active.some((p) => p.textContent.includes('ВИК')),
    active.map((p) => p.textContent).join('|'));
}

console.log(fails === 0 ? '\nAll data-layer tests passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
