/* Admin panel against a mocked Supabase, plus the Vercel middleware logic. */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';
/* Repo root, derived from this file so the suite runs from anywhere. */
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0;
const check = (n, c, e = '') => {
  if (c) console.log(`  ok   ${n}`);
  else { console.log(`  FAIL ${n} ${e}`); fails++; }
};
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

/* A stand-in Supabase: records every call so we can assert on the wire format. */
function makeBackend({ signInOk = true } = {}) {
  const calls = [];
  const rows = [{
    slug: 'kotik', published: true, sort_order: 1,
    tag_ids: ['cat', 'fiv'],
    doc: {
      name: { ru: 'Котик', en: 'Kotik' }, subtitle: { ru: 'Кот' },
      shortDescription: { ru: 'коротко' }, description: { ru: 'длинно' },
      tags: [{ id: 'cat', ru: 'Кот' }, { id: 'fiv', ru: 'ВИК' }],
      gallery: [{ type: 'image', src: 'media/kotik-2026-03-12.webp' }],
      mainPhoto: { src: 'media/kotik-2026-03-12.webp' },
      donate: {}, curator: {}, docs: [], carePlan: [], sections: [],
    },
  }, {
    slug: 'draft-pet', published: false, sort_order: 2, tag_ids: [],
    doc: { name: { ru: 'Черновичок' }, gallery: [], donate: {}, curator: {} },
  }];

  const tags = [
    { id: 'cat', label: { ru: 'Кот', en: 'Cat' } },
    { id: 'fiv', label: { ru: 'ВИК (FIV) +', en: 'FIV positive +' } },
    { id: 'needs-home', label: { ru: 'Ищет дом', en: 'Needs a home' } },
  ];
  const curators = [{
    id: 'cur-1', slug: 'mykhailo',
    name: { ru: 'Михаил', en: 'Mykhailo' },
    bio: { ru: 'Био' }, email: 'innosanctum@gmail.com',
    telegram: 'https://t.me/innosanctum', instagram: null, phone: null, photo: null,
    photo_alt: {},
  }];
  const donations = [{
    id: 'don-1', slug: 'kotik-bog',
    url: 'https://egreve.bog.ge/For_Kotik',
    label: { ru: 'Перевести' }, note: {}, qr: 'assets/qr_code.png',
  }];

  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', headers: opts.headers, body: opts.body });

    const method = opts.method || 'GET';
    for (const [path, rowset] of [['tags', tags], ['curators', curators], ['donation_links', donations]]) {
      if (url.includes('/rest/v1/' + path)) {
        if (method === 'GET') return { ok: true, status: 200, json: async () => rowset };
        /* Upserts echo the row back with an id, the way PostgREST does with
           Prefer: return=representation — that id becomes the pet's FK. */
        const sent = JSON.parse(opts.body);
        const list = Array.isArray(sent) ? sent : [sent];
        return {
          ok: true, status: 201,
          json: async () => list.map((r, i) => Object.assign({ id: path + '-new-' + i }, r)),
        };
      }
    }

    if (url.includes('/auth/v1/token')) {
      if (!signInOk) {
        return { ok: false, status: 400, json: async () => ({ error_description: 'Invalid login credentials' }) };
      }
      return {
        ok: true, status: 200,
        json: async () => ({
          access_token: 'jwt-access', refresh_token: 'jwt-refresh',
          expires_in: 3600, user: { id: 'u1', email: 'admin@example.com' },
        }),
      };
    }
    if (url.includes('/rest/v1/pets')) {
      const method = opts.method || 'GET';
      if (method === 'GET') return { ok: true, status: 200, json: async () => rows };
      if (method === 'POST') return { ok: true, status: 201, json: async () => [JSON.parse(opts.body)] };
      if (method === 'DELETE') return { ok: true, status: 204, json: async () => null };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };
  return { fetchImpl, calls };
}

function boot(backend) {
  const dom = new JSDOM(readFileSync(join(ROOT, 'admin.html'), 'utf8'), {
    runScripts: 'dangerously', url: 'https://x.org/admin.html?lang=en', pretendToBeVisual: true,
  });
  const w = dom.window, d = w.document;
  for (const tag of [...d.querySelectorAll('script[src]')]) {
    const f = tag.getAttribute('src');
    const s = d.createElement('script');
    s.textContent = readFileSync(join(ROOT, f), 'utf8');
    d.head.appendChild(s);
    if (f === 'config.js') {
      w.SITE_CONFIG.supabase = { url: 'https://demo.supabase.co', anonKey: 'anon-123' };
      w.fetch = backend.fetchImpl;
    }
  }
  /* jsdom will not fetch the lazily-injected QR vendor script, so preload it
     to exercise the donation preview. */
  /* jsdom has no layout, so scrollTo is unimplemented and logs a stack trace
     on every editor open. The editor only uses it cosmetically. */
  w.scrollTo = () => {};
  const vendor = d.createElement('script');
  vendor.textContent = readFileSync(join(ROOT, 'assets/vendor/qrcode.js'), 'utf8');
  d.head.appendChild(vendor);
  d.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, d };
}

/* ---------------------------------------------------------- sign-in ---- */
console.log('\nAdmin: configured but signed out');
{
  const backend = makeBackend();
  const { d } = boot(backend);
  await settle();
  check('not-configured panel hidden', d.getElementById('not-configured').hidden === true);
  check('sign-in form shown', d.getElementById('auth-wrap').hidden === false);
  check('editor hidden', d.getElementById('app-wrap').hidden === true);
  check('no data fetched before sign-in',
    !backend.calls.some((c) => c.url.includes('/rest/v1/pets')));
}

console.log('\nAdmin: wrong password');
{
  const backend = makeBackend({ signInOk: false });
  const { w, d } = boot(backend);
  await settle();
  d.getElementById('admin-email').value = 'admin@example.com';
  d.getElementById('admin-password').value = 'wrong';
  d.getElementById('sign-in-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  check('stays on the sign-in screen', d.getElementById('app-wrap').hidden === true);
  check('shows an error', d.getElementById('auth-error').hidden === false);
  check('error is the friendly message',
    /Wrong email or password/i.test(d.getElementById('auth-error').textContent),
    d.getElementById('auth-error').textContent);
}

console.log('\nAdmin: successful sign-in');
let signedIn;
{
  const backend = makeBackend();
  const { w, d } = boot(backend);
  await settle();
  d.getElementById('admin-email').value = 'admin@example.com';
  d.getElementById('admin-password').value = 'correct-horse';
  d.getElementById('sign-in-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(250);

  const auth = backend.calls.find((c) => c.url.includes('/auth/v1/token'));
  check('posts to the password grant', /grant_type=password/.test(auth.url));
  check('sends the anon apikey', auth.headers.apikey === 'anon-123');
  check('password is not in the URL', !auth.url.includes('correct-horse'));

  check('editor is shown', d.getElementById('app-wrap').hidden === false);
  check('sign-in form hidden', d.getElementById('auth-wrap').hidden === true);
  check('shows the signed-in email',
    d.getElementById('admin-who').textContent === 'admin@example.com');

  const listCall = backend.calls.find((c) => c.url.includes('/rest/v1/pets') && c.method === 'GET');
  check('lists pets including drafts', !listCall.url.includes('published=eq.true'), listCall.url);
  check('uses the session JWT, not the anon key',
    listCall.headers.Authorization === 'Bearer jwt-access', listCall.headers.Authorization);

  const entries = d.querySelectorAll('.admin-entry');
  check('renders both records (draft included)', entries.length === 2, `${entries.length}`);
  check('marks the draft as Draft', d.querySelector('.admin-entry:nth-child(2)').textContent.includes('Draft'));
  check('marks the live one as Published',
    d.querySelector('.admin-entry:nth-child(1)').textContent.includes('Published'));
  check('shows which languages are filled',
    d.querySelector('.admin-entry:nth-child(1)').textContent.includes('RU, EN'));

  signedIn = { w, d, backend };
}

/* ------------------------------------------------------------ editor --- */
console.log('\nAdmin: editing a record');
{
  const { w, d, backend } = signedIn;
  const editBtn = [...d.querySelectorAll('.admin-entry button')].find((b) => b.textContent === 'Edit');
  editBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();

  check('editor panel opens', d.getElementById('editor-wrap').hidden === false);
  check('list is hidden while editing', d.getElementById('list-wrap').hidden === true);

  const langRows = d.querySelectorAll('.lang-row');
  check('renders one input per language', langRows.length > 20, `${langRows.length} rows`);
  check('RU is flagged as the primary', d.querySelectorAll('.lang-tag-primary').length > 5);

  const nameRu = [...d.querySelectorAll('.lang-row input[data-lang="ru"]')]
    .find((i) => i.value === 'Котик');
  check('loads the existing Russian name', !!nameRu);

  // Edit the name and save.
  nameRu.value = 'Котик Второй';
  nameRu.dispatchEvent(new w.Event('input', { bubbles: true }));

  const saveBtn = [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save');
  saveBtn.dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle(250);

  const post = backend.calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/pets')).pop();
  check('saves via POST upsert', !!post && post.url.includes('on_conflict=slug'), post && post.url);
  check('sends merge-duplicates', /merge-duplicates/.test(post.headers.Prefer));
  check('authorises with the session JWT', post.headers.Authorization === 'Bearer jwt-access');
  // Regression: per-request headers used to overwrite the auth headers
  // instead of merging, so saves went out unauthenticated.
  check('save still carries the apikey header', post.headers.apikey === 'anon-123',
    JSON.stringify(post.headers));
  check('save still carries Content-Type', post.headers['Content-Type'] === 'application/json');

  const body = JSON.parse(post.body);
  check('slug is a top-level column', body.slug === 'kotik');
  check('edited name is in the payload', body.doc.name.ru === 'Котик Второй');
  check('other languages preserved', body.doc.name.en === 'Kotik');
  check('tag_ids denormalised for indexing',
    JSON.stringify(body.tag_ids) === JSON.stringify(['cat', 'fiv']), JSON.stringify(body.tag_ids));
  check('empty video dropped, not saved as blank', body.doc.video === null);
  check('doc does not duplicate the slug', body.doc.slug === undefined);

  check('returns to the list after saving', d.getElementById('list-wrap').hidden === false);
}

console.log('\nAdmin: validation');
{
  const backend = makeBackend();
  const { w, d } = boot(backend);
  await settle();
  d.getElementById('admin-email').value = 'a@b.c';
  d.getElementById('admin-password').value = 'x';
  d.getElementById('sign-in-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(250);

  d.getElementById('new-pet').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();
  check('new-record editor opens', d.getElementById('editor-wrap').hidden === false);

  const before = backend.calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/pets')).length;
  const save = () => [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')
    .dispatchEvent(new w.Event('click', { bubbles: true }));

  save();
  await settle();
  check('refuses to save without a slug',
    /Slug is required/i.test(d.getElementById('admin-status').textContent),
    d.getElementById('admin-status').textContent);

  const slugInput = [...d.querySelectorAll('input')].find((i) => i.placeholder === 'kotik');
  slugInput.value = 'Bad Slug!';
  slugInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  save();
  await settle();
  check('rejects an invalid slug', /Slug is required/i.test(d.getElementById('admin-status').textContent));

  slugInput.value = 'good-slug';
  slugInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  save();
  await settle();
  check('refuses to save without a name',
    /name in at least one language/i.test(d.getElementById('admin-status').textContent),
    d.getElementById('admin-status').textContent);

  const after = backend.calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/pets')).length;
  check('no invalid record ever reached the network', before === after);
}

console.log('\nAdmin: delete');
{
  const backend = makeBackend();
  const { w, d } = boot(backend);
  await settle();
  d.getElementById('admin-email').value = 'a@b.c';
  d.getElementById('admin-password').value = 'x';
  d.getElementById('sign-in-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(250);

  w.confirm = () => false;
  [...d.querySelectorAll('.admin-entry button')].find((b) => b.textContent === 'Delete')
    .dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();
  check('cancelling the confirm deletes nothing',
    !backend.calls.some((c) => c.method === 'DELETE'));

  w.confirm = () => true;
  [...d.querySelectorAll('.admin-entry button')].find((b) => b.textContent === 'Delete')
    .dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle(250);
  const del = backend.calls.find((c) => c.method === 'DELETE');
  check('confirming issues a DELETE', !!del);
  check('deletes by slug', del.url.includes('slug=eq.kotik'), del.url);
  check('authorised with the JWT', del.headers.Authorization === 'Bearer jwt-access');
}

/* ------------------------------------------------ suggestions & slugs --- */
async function signedInAdmin() {
  const backend = makeBackend();
  const { w, d } = boot(backend);
  await settle();
  d.getElementById('admin-email').value = 'a@b.c';
  d.getElementById('admin-password').value = 'x';
  d.getElementById('sign-in-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await settle(250);
  return { w, d, backend };
}

const clickButton = (d, w, text) =>
  [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
    .dispatchEvent(new w.Event('click', { bubbles: true }));

/* The editor has an "Add" button per repeater (gallery, care plan, docs...),
   so the tag one has to be reached through the tag input, not by label. */
const addTag = (d, w, value) => {
  const input = d.querySelector('input[list="tag-suggestions"]');
  input.value = value;
  input.parentNode.querySelector('button').dispatchEvent(new w.Event('click', { bubbles: true }));
};

console.log('\nAdmin: catalogues are fetched');
{
  const { backend } = await signedInAdmin();
  const got = (p) => backend.calls.some((c) => c.url.includes('/rest/v1/' + p) && c.method === 'GET');
  check('fetches tags', got('tags'));
  check('fetches curators', got('curators'));
  check('fetches donation links', got('donation_links'));
}

console.log('\nAdmin: slug generated from the name');
{
  const { w, d } = await signedInAdmin();
  d.getElementById('new-pet').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();

  const slugInput = [...d.querySelectorAll('input')].find((i) => i.placeholder === 'kotik');
  check('slug starts empty', slugInput.value === '');

  const nameRu = [...d.querySelectorAll('.lang-row input[data-lang="ru"]')][0];
  nameRu.value = 'Барсик';
  nameRu.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('typing a Russian name fills a latin slug', slugInput.value === 'barsik', slugInput.value);

  nameRu.value = 'Котик';
  nameRu.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('an existing slug is avoided', slugInput.value === 'kotik-2', slugInput.value);

  /* Once edited by hand the slug is the curator's, not ours. */
  slugInput.value = 'my-own-slug';
  slugInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  nameRu.value = 'Рыжик';
  nameRu.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('a hand-typed slug is not overwritten', slugInput.value === 'my-own-slug', slugInput.value);

  clickButton(d, w, 'Auto');
  check('"Auto" resumes generation', slugInput.value === 'ryzhik', slugInput.value);
}

console.log('\nAdmin: editing an existing pet keeps its slug');
{
  const { w, d } = await signedInAdmin();
  [...d.querySelectorAll('.admin-entry button')].find((b) => b.textContent === 'Edit')
    .dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();
  const slugInput = [...d.querySelectorAll('input')].find((i) => i.placeholder === 'kotik');
  const nameRu = [...d.querySelectorAll('.lang-row input[data-lang="ru"]')].find((i) => i.value === 'Котик');
  nameRu.value = 'Котик Переименованный';
  nameRu.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('published URL is never silently changed', slugInput.value === 'kotik', slugInput.value);
}

console.log('\nAdmin: tag suggestions');
{
  const { w, d } = await signedInAdmin();
  d.getElementById('new-pet').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();

  const datalist = d.getElementById('tag-suggestions');
  check('a datalist of known tags exists', !!datalist);
  check('every catalogue tag is offered', datalist.querySelectorAll('option').length === 3,
    `${datalist.querySelectorAll('option').length}`);
  check('options show the readable label (page is in EN)',
    [...datalist.querySelectorAll('option')].some((o) => o.value === 'FIV positive +'),
    [...datalist.querySelectorAll('option')].map((o) => o.value).join(' | '));

  /* Adding by label should pull in the full catalogue entry, translations and
     all — that is the whole point of suggesting. */
  addTag(d, w, 'ВИК (FIV) +');
  await settle();
  let ids = [...d.querySelectorAll('.repeater-index code')].map((c) => c.textContent);
  check('adding by label resolves to the catalogue id', ids.includes('fiv'), JSON.stringify(ids));
  check('marked as already saved',
    d.querySelector('.repeater-item .pill-ok') !== null);
  const enLabel = [...d.querySelectorAll('.lang-row input[data-lang="en"]')]
    .find((i) => i.value === 'FIV positive +');
  check('English label came along', !!enLabel);

  /* Adding by id should work too. */
  addTag(d, w, 'cat');
  await settle();
  ids = [...d.querySelectorAll('.repeater-index code')].map((c) => c.textContent);
  check('adding by id works', ids.includes('cat'), JSON.stringify(ids));

  /* A brand-new tag is accepted and transliterated. */
  addTag(d, w, 'Пушистый');
  await settle();
  ids = [...d.querySelectorAll('.repeater-index code')].map((c) => c.textContent);
  check('a new tag gets a transliterated id', ids.includes('pushistyy'), JSON.stringify(ids));
  check('new tag flagged as new',
    [...d.querySelectorAll('.repeater-item')].some((i) =>
      i.textContent.includes('pushistyy') && i.querySelector('.pill:not(.pill-ok)')));

  /* Duplicates are refused rather than silently doubling a filter. */
  addTag(d, w, 'cat');
  await settle();
  ids = [...d.querySelectorAll('.repeater-index code')].map((c) => c.textContent);
  check('duplicate tag refused', ids.filter((i) => i === 'cat').length === 1, JSON.stringify(ids));
}

console.log('\nAdmin: curator and donation suggestions');
{
  const { w, d } = await signedInAdmin();
  d.getElementById('new-pet').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();

  const selects = [...d.querySelectorAll('select')];
  const curatorSelect = selects.find((s) =>
    [...s.options].some((o) => o.textContent.includes('mykhailo')));
  check('existing curators are offered', !!curatorSelect);

  curatorSelect.value = 'mykhailo';
  curatorSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  await settle();
  const telegram = [...d.querySelectorAll('input')].find((i) => i.value === 'https://t.me/innosanctum');
  check('picking a curator fills their contacts', !!telegram);
  const curatorId = [...d.querySelectorAll('input')].find((i) => i.placeholder === 'mykhailo');
  check('curator id filled', curatorId && curatorId.value === 'mykhailo', curatorId && curatorId.value);

  const donationSelect = selects.find((s) =>
    [...s.options].some((o) => o.textContent.includes('kotik-bog')));
  check('existing donation links are offered', !!donationSelect);

  donationSelect.value = 'kotik-bog';
  donationSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  await settle();
  const urlInput = [...d.querySelectorAll('input[type="url"]')][0];
  check('picking a link fills the URL',
    urlInput && urlInput.value === 'https://egreve.bog.ge/For_Kotik', urlInput && urlInput.value);
}

console.log('\nAdmin: QR preview');
{
  const { w, d } = await signedInAdmin();
  d.getElementById('new-pet').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();

  const urlInput = [...d.querySelectorAll('input[type="url"]')][0];
  urlInput.value = 'https://pay.example/abc';
  urlInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await settle(250);

  const preview = d.querySelector('.qr-preview');
  check('a QR is drawn from the typed link', !!preview.querySelector('svg'));

  const before = preview.innerHTML;
  urlInput.value = 'https://pay.example/different';
  urlInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await settle(250);
  check('changing the link redraws the QR', preview.innerHTML !== before);
  check('link id auto-derived from the URL',
    [...d.querySelectorAll('input')].some((i) => i.placeholder === 'kotik-bog' && i.value.length > 0));
}

console.log('\nAdmin: saving writes the shared records first');
{
  const { w, d, backend } = await signedInAdmin();
  d.getElementById('new-pet').dispatchEvent(new w.Event('click', { bubbles: true }));
  await settle();

  const nameRu = [...d.querySelectorAll('.lang-row input[data-lang="ru"]')][0];
  nameRu.value = 'Барсик';
  nameRu.dispatchEvent(new w.Event('input', { bubbles: true }));

  addTag(d, w, 'Пушистый');
  await settle();

  const curatorSelect = [...d.querySelectorAll('select')].find((s) =>
    [...s.options].some((o) => o.textContent.includes('mykhailo')));
  curatorSelect.value = 'mykhailo';
  curatorSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
  await settle();

  const urlInput = [...d.querySelectorAll('input[type="url"]')][0];
  urlInput.value = 'https://pay.example/barsik';
  urlInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  await settle();

  clickButton(d, w, 'Save');
  await settle(400);

  const posts = backend.calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/'));
  const order = posts.map((c) => c.url.match(/rest\/v1\/([a-z_]+)/)[1]);

  check('tags saved', order.includes('tags'));
  check('curator saved', order.includes('curators'));
  check('donation link saved', order.includes('donation_links'));
  check('pet saved', order.includes('pets'));
  check('pet is written last, after its foreign keys exist',
    order.indexOf('pets') === order.length - 1, JSON.stringify(order));

  const tagPost = JSON.parse(posts.find((c) => c.url.includes('/tags')).body);
  check('new tag sent with its label',
    tagPost.some((t) => t.id === 'pushistyy' && t.label.ru === 'Пушистый'), JSON.stringify(tagPost));

  const curatorPost = JSON.parse(posts.find((c) => c.url.includes('/curators')).body);
  check('curator sent with snake_case photo_alt', 'photo_alt' in curatorPost);
  check('curator keyed on slug', curatorPost.slug === 'mykhailo');

  const petPost = JSON.parse(posts.find((c) => c.url.includes('/pets')).body);
  check('pet stores tag ids only',
    JSON.stringify(petPost.tag_ids) === JSON.stringify(['pushistyy']), JSON.stringify(petPost.tag_ids));
  check('pet links to the returned curator id',
    petPost.curator_id === 'curators-new-0', petPost.curator_id);
  check('pet links to the returned donation id',
    petPost.donation_id === 'donation_links-new-0', petPost.donation_id);
  check('pet does not duplicate the curator into doc', petPost.doc.curator === undefined);
  check('pet does not duplicate the donation into doc', petPost.doc.donate === undefined);
  check('generated slug used', petPost.slug === 'barsik', petPost.slug);
}

/* -------------------------------------------------------- middleware --- */
console.log('\nVercel middleware IP gate');
{
  const src = readFileSync(join(ROOT, 'middleware.js'), 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const mw = mod.default;
  const req = (ip) => ({ headers: { get: (h) => (h === 'x-real-ip' ? ip : null) } });

  process.env.ADMIN_IP_ALLOWLIST = '';
  check('unset allowlist lets everything through', mw(req('9.9.9.9')) === undefined);

  process.env.ADMIN_IP_ALLOWLIST = '203.0.113.42';
  check('exact match allowed', mw(req('203.0.113.42')) === undefined);
  check('other address blocked', mw(req('203.0.113.43'))?.status === 404);
  check('blocked response is a 404, not a 403', mw(req('1.2.3.4')).status === 404);

  process.env.ADMIN_IP_ALLOWLIST = '198.51.100.0/24';
  check('CIDR: inside the range', mw(req('198.51.100.77')) === undefined);
  check('CIDR: outside the range', mw(req('198.51.101.77'))?.status === 404);
  check('CIDR: boundary .0', mw(req('198.51.100.0')) === undefined);
  check('CIDR: boundary .255', mw(req('198.51.100.255')) === undefined);

  process.env.ADMIN_IP_ALLOWLIST = '10.0.0.0/8, 203.0.113.42';
  check('multiple rules: first matches', mw(req('10.1.2.3')) === undefined);
  check('multiple rules: second matches', mw(req('203.0.113.42')) === undefined);
  check('multiple rules: neither matches', mw(req('172.16.0.1'))?.status === 404);

  check('missing IP is blocked when a list is set', mw(req(null))?.status === 404);
  check('garbage IP is blocked', mw(req('not-an-ip'))?.status === 404);
  check('only guards the admin route',
    JSON.stringify(mod.config.matcher) === JSON.stringify(['/admin', '/admin.html']));
  delete process.env.ADMIN_IP_ALLOWLIST;
}

console.log(fails === 0 ? '\nAll admin tests passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
