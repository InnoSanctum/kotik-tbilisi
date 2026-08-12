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

  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', headers: opts.headers, body: opts.body });

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
