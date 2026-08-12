/* Gigs: the record shape, the main-page section, the detail page, the admin. */
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
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function visibleText(doc) {
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  return clone.textContent;
}

/* Dates relative to today, so the upcoming/past split never rots. */
const shift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const FUTURE = shift(30);
const PAST = shift(-30);
const LONG_AGO = shift(-200);

const GIGS = [
  {
    slug: 'vake-park', published: true, sortOrder: 0, date: FUTURE,
    title: { ru: 'Концерт в парке Ваке', en: 'Vake Park concert' },
    venue: { ru: 'Парк Ваке', en: 'Vake Park' },
    description: { ru: 'Первый абзац.\n\nВторой абзац.' },
    link: 'https://example.org/event',
    petSlugs: ['kotik'],
    mainPhoto: { type: 'image', src: 'media/kotik-2026-03-12.webp', thumb: '', alt: { ru: 'Сцена' } },
    gallery: [{ type: 'image', src: 'media/kotik-2025-09-08.webp', thumb: '', alt: { ru: 'Гитара' } }],
  },
  {
    slug: 'fabrika', published: true, sortOrder: 0, date: PAST,
    title: { ru: 'Выступление на Фабрике' },
    venue: {}, description: {}, petSlugs: [], gallery: [],
    mainPhoto: null,
  },
  {
    slug: 'old-one', published: true, sortOrder: 0, date: LONG_AGO,
    title: { ru: 'Давнее' }, venue: {}, description: {}, petSlugs: [], gallery: [], mainPhoto: null,
  },
  {
    slug: 'secret', published: false, sortOrder: 0, date: FUTURE,
    title: { ru: 'Черновик выступления' },
    venue: {}, description: {}, petSlugs: [], gallery: [], mainPhoto: null,
  },
];

function boot({ page = 'index.html', url = 'https://x.org/index.html?lang=ru', gigs = GIGS } = {}) {
  const dom = new JSDOM(readFileSync(join(ROOT, page), 'utf8'), {
    runScripts: 'dangerously', url, pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  w.scrollTo = () => {};
  for (const tag of [...d.querySelectorAll('script[src]')]) {
    const f = tag.getAttribute('src');
    const s = d.createElement('script');
    s.textContent = readFileSync(join(ROOT, f), 'utf8');
    d.head.appendChild(s);
    if (f === 'config.js') w.SITE_CONFIG.supabase = { url: '', anonKey: '' };
    if (f === 'data/pets.js') w.GIGS_SEED = JSON.parse(JSON.stringify(gigs));
  }
  d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, d };
}

/* ------------------------------------------------------ record shape --- */
console.log('\nGig record');
{
  const { w } = boot({});
  const DB = w.PetDB;

  const list = DB.seedGigs(false);
  check('drafts excluded', !list.some((g) => g.slug === 'secret'), list.map((g) => g.slug).join(','));
  check('drafts included when asked', DB.seedGigs(true).length === 4);

  check('future date marked upcoming', list.find((g) => g.slug === 'vake-park').upcoming === true);
  check('past date not upcoming', list.find((g) => g.slug === 'fabrika').upcoming === false);

  /* Upcoming first, then past newest-first. */
  check('sorted upcoming first, then most recent past',
    JSON.stringify(list.map((g) => g.slug)) === JSON.stringify(['vake-park', 'fabrika', 'old-one']),
    JSON.stringify(list.map((g) => g.slug)));

  const vake = list[0];
  check('main photo becomes the first slide',
    vake.gallery.length === 2 && vake.gallery[0].src === 'media/kotik-2026-03-12.webp',
    `${vake.gallery.length} slides`);
  check('petSlugs carried', JSON.stringify(vake.petSlugs) === JSON.stringify(['kotik']));

  /* Database row shape (snake_case columns + doc). */
  const row = DB.normaliseGig({
    slug: 'db-gig', published: true, sort_order: 5, event_date: PAST,
    pet_slugs: ['kotik'],
    doc: { title: { ru: 'Из базы' }, gallery: [{ type: 'image', src: 'a.webp' }] },
  });
  check('event_date column read', row.date === PAST);
  check('pet_slugs column read', JSON.stringify(row.petSlugs) === JSON.stringify(['kotik']));
  check('sort_order column read', row.sortOrder === 5);
  check('title from doc', row.title.ru === 'Из базы');

  console.log('\ngigToRow');
  const back = DB.gigToRow(vake);
  check('event_date is a column', back.event_date === FUTURE);
  check('pet_slugs is a column', JSON.stringify(back.pet_slugs) === JSON.stringify(['kotik']));
  check('date not duplicated in doc', back.doc.date === undefined);
  check('petSlugs not duplicated in doc', back.doc.petSlugs === undefined);
  check('derived "upcoming" never stored', back.doc.upcoming === undefined);
  check('title kept in doc', back.doc.title.ru === 'Концерт в парке Ваке');

  const round = DB.normaliseGig(back);
  check('round-trips the title', round.title.ru === 'Концерт в парке Ваке');
  check('round-trips upcoming', round.upcoming === true);
  check('re-saving does not duplicate slides', round.gallery.length === 2, `${round.gallery.length}`);

  const undated = DB.normaliseGig({ slug: 'x', doc: { title: { ru: 'Без даты' } } });
  check('a gig with no date is not "upcoming"', undated.upcoming === false);
  check('no date is fine', undated.date === '');
}

/* --------------------------------------------------------- main page --- */
console.log('\nMain page: gigs section');
{
  const { w, d } = boot({});
  await settle();

  check('section present', !!d.getElementById('gigs'));
  check('project heading rendered',
    d.getElementById('gigs-title').textContent.includes('Благотворительные'),
    d.getElementById('gigs-title').textContent);
  check('project blurb rendered', d.getElementById('gigs-body').textContent.length > 100);
  check('blurb is project-wide, not about one cat',
    !d.getElementById('gigs-body').textContent.includes('Котика'));

  const cards = d.querySelectorAll('#gig-list .gig-card');
  check('renders published gigs only', cards.length === 3, `${cards.length}`);
  check('draft hidden', !visibleText(d).includes('Черновик выступления'));

  check('upcoming badge shown', visibleText(d).includes('Скоро'));
  check('past badge shown', visibleText(d).includes('Состоялось'));
  check('venue shown', visibleText(d).includes('Парк Ваке'));
  check('card links to the gig page',
    d.querySelector('#gig-list a[href^="gig.html?slug="]') !== null);
  check('supported animal linked from the card',
    d.querySelector('#gig-list a[href="pet.html?slug=kotik"]') !== null);
  check('card shows only the first paragraph',
    visibleText(d).includes('Первый абзац.') && !visibleText(d).includes('Второй абзац.'));
  check('gig without a photo gets a placeholder',
    d.querySelector('#gig-list .gig-placeholder') !== null);
  check('nav links to the section', !!d.querySelector('.site-nav a[href="#gigs"]'));

  /* Date is formatted, not raw ISO. */
  check('date rendered in words, not ISO',
    !visibleText(d).includes(FUTURE) && /\d{4}/.test(visibleText(d)));

  d.querySelector('.lang-btn[data-lang="en"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle(100);
  check('EN switch translates the section',
    visibleText(d).includes('Vake Park concert') && visibleText(d).includes('Upcoming'));
  check('untranslated gig falls back to Russian',
    visibleText(d).includes('Выступление на Фабрике'));
}

console.log('\nMain page: no gigs yet (the honest empty state)');
{
  const { d } = boot({ gigs: [] });
  await settle();
  check('section still shown', !d.getElementById('gigs').hidden);
  check('blurb still explains the idea', d.getElementById('gigs-body').textContent.length > 100);
  check('empty state rendered', d.querySelector('#gig-list .empty-state') !== null);
  check('empty state says performances are coming',
    visibleText(d).includes('Первые выступления'), '');
  check('no gig cards invented', d.querySelectorAll('.gig-card').length === 0);
}

/* ------------------------------------------------------- detail page --- */
console.log('\ngig.html');
{
  const { d } = boot({ page: 'gig.html', url: 'https://x.org/gig.html?slug=vake-park&lang=ru' });
  await settle();

  check('article visible', !d.getElementById('gig-article').hasAttribute('hidden'));
  check('title rendered', d.getElementById('gig-title').textContent === 'Концерт в парке Ваке');
  check('venue rendered', d.getElementById('gig-meta').textContent.includes('Парк Ваке'));
  check('upcoming badge', d.getElementById('gig-badges').textContent.includes('Скоро'));
  check('description split into paragraphs',
    d.querySelectorAll('#gig-description .bio-text').length === 2,
    `${d.querySelectorAll('#gig-description .bio-text').length}`);
  check('gallery mounted with both items',
    d.querySelectorAll('#gig-gallery .thumb-item').length === 2,
    `${d.querySelectorAll('#gig-gallery .thumb-item').length}`);
  check('supported animal linked',
    d.querySelector('#gig-supports a[href="pet.html?slug=kotik"]') !== null);
  check('external link rendered',
    d.querySelector('#gig-link a[href="https://example.org/event"]') !== null);
  check('external link is safe',
    d.querySelector('#gig-link a').getAttribute('rel') === 'noopener noreferrer');
  check('page title updated', d.title.startsWith('Концерт'));
}

console.log('\ngig.html: sparse and missing records');
{
  const { d } = boot({ page: 'gig.html', url: 'https://x.org/gig.html?slug=fabrika&lang=ru' });
  await settle();
  check('renders with no description, media or link',
    !d.getElementById('gig-article').hasAttribute('hidden'));
  check('empty description block hidden', d.getElementById('gig-description').hidden === true);
  check('empty gallery hidden', d.getElementById('gig-gallery').hidden === true);
  check('no empty link button', d.getElementById('gig-link').textContent === '');
  check('past badge', d.getElementById('gig-badges').textContent.includes('Состоялось'));
}
{
  const { d } = boot({ page: 'gig.html', url: 'https://x.org/gig.html?slug=nope&lang=ru' });
  await settle();
  check('unknown slug shows not-found', !d.getElementById('gig-missing').hasAttribute('hidden'));
  check('article hidden', d.getElementById('gig-article').hasAttribute('hidden'));
  check('offers a way back', !!d.querySelector('#gig-missing a[href="index.html#gigs"]'));
}
{
  const { d } = boot({ page: 'gig.html', url: 'https://x.org/gig/vake-park?lang=ru' });
  await settle();
  check('clean /gig/<slug> URL works',
    d.getElementById('gig-title').textContent === 'Концерт в парке Ваке');
}

/* ------------------------------------------------ Kotik page unchanged - */
console.log('\nKotik keeps his content after the gig text moved');
{
  const { d } = boot({ page: 'pet.html', url: 'https://x.org/pet.html?slug=kotik&lang=ru' });
  await settle();
  check('story intact', d.getElementById('pet-story').textContent.length > 1500);
  check('care plan intact', d.querySelectorAll('#pet-care .medical-item').length === 4);
  check('gallery intact', d.querySelectorAll('#pet-gallery .thumb-item').length === 7);
  check('the gig blurb no longer duplicated on his page',
    d.getElementById('pet-sections').hasAttribute('hidden'));
}

console.log(fails === 0 ? '\nAll gig tests passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
