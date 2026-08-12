/* Render each page in jsdom and assert the real content actually appears. */
import { JSDOM, VirtualConsole } from 'jsdom';
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

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${extra}`); failures++; }
};

async function render(page, url) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (...a) => errors.push(a.join(' ')));

  const dom = new JSDOM(readFileSync(join(ROOT, page), 'utf8'), {
    runScripts: 'dangerously',
    resources: undefined,
    url,
    virtualConsole: vc,
    pretendToBeVisual: true,
  });

  // Load the local <script src> files by hand (jsdom won't fetch file://).
  const win = dom.window;
  const doc = win.document;
  for (const tag of [...doc.querySelectorAll('script[src]')]) {
    const code = readFileSync(join(ROOT, tag.getAttribute('src')), 'utf8');
    const s = doc.createElement('script');
    s.textContent = code;
    doc.head.appendChild(s);
  }
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  return { win, doc, errors };
}

/* ------------------------------------------------------------ index.html */
console.log('\nindex.html (default language, RU)');
{
  const { doc, win, errors } = await render('index.html', 'https://example.org/index.html?lang=ru');
  check('no script errors', errors.length === 0, errors.join(' | '));

  const cards = doc.querySelectorAll('.pet-card');
  check('renders exactly 1 pet card', cards.length === 1, `got ${cards.length}`);
  check('card shows "Котик"', visibleText(doc).includes('Котик'));
  check('no fabricated pet "Миша"/"Misha"',
    !visibleText(doc).includes('Миша') && !visibleText(doc).includes('Misha'));

  const link = doc.querySelector('.pet-card a[href*="slug="]');
  check('card links to pet.html?slug=kotik', link?.getAttribute('href') === 'pet.html?slug=kotik',
    link?.getAttribute('href'));

  const img = doc.querySelector('.pet-image img');
  check('card image is a real media file', img?.getAttribute('src') === 'media/kotik-2026-03-12.webp',
    img?.getAttribute('src'));

  check('about text rendered', doc.getElementById('about-body').textContent.length > 100);
  check('hero title from SITE_CONTENT',
    doc.getElementById('hero-title').textContent.includes('Тбилиси'));
  check('tag filters rendered', doc.querySelectorAll('.filter-pill').length >= 6,
    `${doc.querySelectorAll('.filter-pill').length} pills`);
  check('contacts links rendered', doc.querySelectorAll('#contacts-links .contact-link').length === 3);
  check('result count set', /1/.test(doc.getElementById('result-count').textContent));

  // --- search
  const search = doc.getElementById('search-input');
  search.value = 'котик';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('search "котик" keeps the card', doc.querySelectorAll('.pet-card').length === 1);

  search.value = 'zzzz';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('search "zzzz" shows empty state', doc.querySelectorAll('.empty-state').length === 1);

  search.value = 'fiv';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  check('search by tag id "fiv" finds the pet', doc.querySelectorAll('.pet-card').length === 1);

  search.value = '';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));

  // --- tag filter click
  const pills = [...doc.querySelectorAll('.filter-pill')];
  const fivPill = pills.find((p) => p.textContent.includes('ВИК'));
  check('found the ВИК tag pill', !!fivPill);
  fivPill?.dispatchEvent(new win.Event('click', { bubbles: true }));
  check('tag filter keeps the matching pet', doc.querySelectorAll('.pet-card').length === 1);

  // --- language switch
  const en = doc.querySelector('.lang-btn[data-lang="en"]');
  en.dispatchEvent(new win.Event('click', { bubbles: true }));
  check('EN switch renders English name', visibleText(doc).includes('Kotik'));
  check('EN switch translates chrome', visibleText(doc).includes('Read more'));

  const ka = doc.querySelector('.lang-btn[data-lang="ka"]');
  ka.dispatchEvent(new win.Event('click', { bubbles: true }));
  check('KA switch renders Georgian', visibleText(doc).includes('კოტიკი'));
  check('html lang attribute follows', doc.documentElement.lang === 'ka');
}

/* -------------------------------------------------------------- pet.html */
console.log('\npet.html?slug=kotik');
{
  const { doc, win, errors } = await render('pet.html', 'https://example.org/pet.html?slug=kotik&lang=ru');
  check('no script errors', errors.length === 0, errors.join(' | '));
  check('article visible', !doc.getElementById('pet-article').hasAttribute('hidden'));
  check('name rendered', doc.getElementById('pet-name').textContent === 'Котик');
  check('subtitle rendered', doc.getElementById('pet-subtitle').textContent.includes('Дворовой'));

  const story = doc.getElementById('pet-story').textContent;
  check('full story restored (long)', story.length > 1500, `${story.length} chars`);
  check('story mentions ВИК', story.includes('ВИК'));
  check('story mentions the courtyard detail', story.includes('итальянском дворике'));
  check('story is split into paragraphs',
    doc.querySelectorAll('#pet-story .bio-text').length === 4,
    `${doc.querySelectorAll('#pet-story .bio-text').length} paragraphs`);

  check('gallery has 7 thumbs', doc.querySelectorAll('#pet-gallery .thumb-item').length === 7,
    `${doc.querySelectorAll('#pet-gallery .thumb-item').length}`);
  check('gallery counter shows 1 / 7',
    doc.querySelector('#pet-gallery .gallery-counter').textContent === '1 / 7');

  check('care plan has 4 steps', doc.querySelectorAll('#pet-care .medical-item').length === 4);
  check('care plan marks 2 done', doc.querySelectorAll('#pet-care .medical-item.done').length === 2);
  check('WBC 23.2 preserved', doc.getElementById('pet-care').textContent.includes('23.2'));

  check('2 documents linked', doc.querySelectorAll('#pet-docs .doc-link').length === 2);
  check('blood test doc present',
    !!doc.querySelector('#pet-docs a[href="assets/blood_test.png"]'));

  const donate = doc.getElementById('pet-donate');
  check('donate link is the real BoG URL',
    donate.querySelector('a.donate-btn')?.href === 'https://egreve.bog.ge/For_Kotik',
    donate.querySelector('a.donate-btn')?.href);
  check('QR code rendered', !!donate.querySelector('img[src="assets/qr_code.png"]'));

  check('video section hidden (no real clip)',
    doc.getElementById('pet-video').hasAttribute('hidden'));
  check('no Rickroll id anywhere', !doc.body.innerHTML.includes('dQw4w9WgXcQ'));

  check('curator name rendered', doc.getElementById('pet-curator').textContent.includes('Михаил'));
  check('curator contacts rendered',
    doc.querySelectorAll('#pet-curator .contact-link').length === 3);
  check('instagram handle correct',
    !!doc.querySelector('#pet-curator a[href="https://www.instagram.com/mserhiievskyi/"]'));

  check('charity gigs section restored',
    doc.getElementById('pet-sections').textContent.includes('акустические выступления'));

  check('tags link back to a filtered list',
    doc.querySelector('#pet-tags a')?.getAttribute('href')?.startsWith('index.html?tag='));

  check('title updated', doc.title.startsWith('Котик'));

  // language switch keeps gallery position
  doc.querySelector('.lang-btn[data-lang="en"]').dispatchEvent(new win.Event('click', { bubbles: true }));
  check('EN story rendered', doc.getElementById('pet-story').textContent.includes('Italian courtyard'));
  check('EN gallery still 7 thumbs', doc.querySelectorAll('#pet-gallery .thumb-item').length === 7);
  check('EN care plan intact', doc.querySelectorAll('#pet-care .medical-item').length === 4);

  doc.querySelector('.lang-btn[data-lang="ka"]').dispatchEvent(new win.Event('click', { bubbles: true }));
  check('KA story rendered', doc.getElementById('pet-story').textContent.includes('იტალიურ ეზოში'));
}

/* ------------------------------------------------------ pet.html missing */
console.log('\npet.html?slug=nope (not found path)');
{
  const { doc, errors } = await render('pet.html', 'https://example.org/pet.html?slug=nope&lang=ru');
  check('no script errors', errors.length === 0, errors.join(' | '));
  check('article hidden', doc.getElementById('pet-article').hasAttribute('hidden'));
  check('not-found state shown', !doc.getElementById('pet-missing').hasAttribute('hidden'));
  check('offers a way back', !!doc.querySelector('#pet-missing a[href="index.html"]'));
}

/* --------------------------------------------- pet.html via /pet/<slug> */
console.log('\n/pet/kotik (Vercel clean URL)');
{
  const { doc, errors } = await render('pet.html', 'https://example.org/pet/kotik?lang=ru');
  check('no script errors', errors.length === 0, errors.join(' | '));
  check('slug read from the path', doc.getElementById('pet-name').textContent === 'Котик');
}

/* ------------------------------------------------------------ admin.html */
console.log('\nadmin.html (Supabase not configured)');
{
  const { doc, errors } = await render('admin.html', 'https://example.org/admin.html');
  check('no script errors', errors.length === 0, errors.join(' | '));
  check('shows the not-configured panel',
    !doc.getElementById('not-configured').hasAttribute('hidden'));
  check('hides the sign-in form', doc.getElementById('auth-wrap').hasAttribute('hidden'));
  check('hides the editor', doc.getElementById('app-wrap').hasAttribute('hidden'));
}

console.log(failures === 0 ? '\nAll render tests passed.' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
