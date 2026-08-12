/* Static validation of the generated seed and the schema. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';

/* Repo root, derived from this file so the suite runs from anywhere. */
const ROOT = pjoin(dirname(fileURLToPath(import.meta.url)), '..', '..');

let fails = 0;
const check = (n, c, e = '') => {
  if (c) console.log(`  ok   ${n}`);
  else { console.log(`  FAIL ${n} ${e}`); fails++; }
};

const seed = readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8');
const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');

const sandbox = { window: {} };
runInNewContext(readFileSync(join(ROOT, 'data/pets.js'), 'utf8'), sandbox);
const SRC = sandbox.window;

/* SQL literal -> original string. */
const unquote = (s) => s.replace(/''/g, "'");

console.log('\nseed.sql structure');
check('inserts tags', /insert into public\.tags \(id, label\)/.test(seed));
check('inserts curators', /insert into public\.curators \(slug, name, bio/.test(seed));
check('inserts donation links', /insert into public\.donation_links \(slug, url, label/.test(seed));
check('inserts pets', /insert into public\.pets \(slug, published, sort_order, tag_ids, curator_id, donation_id, doc\)/.test(seed));

/* Foreign keys must exist before the rows that reference them. */
const order = ['public.tags', 'public.curators', 'public.donation_links', 'public.pets']
  .map((t) => seed.indexOf(`insert into ${t}`));
check('parents are inserted before pets',
  order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])), JSON.stringify(order));

console.log('\nseed.sql is idempotent');
check('tags upsert', /on conflict \(id\) do update set label/.test(seed));
check('curators upsert', /on conflict \(slug\) do update set\s+name/.test(seed));
check('donation links upsert', /on conflict \(slug\) do update set\s+url/.test(seed));
check('pets upsert', /on conflict \(slug\) do update set\s+published/.test(seed));

console.log('\npets rows');
const petRe = /\('([a-z0-9-]+)', (true|false), (\d+), ARRAY\[([^\]]*)\]::text\[\], (null|\(select id from public\.curators where slug = '[^']+'\)), (null|\(select id from public\.donation_links where slug = '[^']+'\)), '((?:[^']|'')*)'::jsonb\)/g;
let m, rows = 0;
while ((m = petRe.exec(seed)) !== null) {
  rows++;
  const [, slug, published, sortOrder, tags, curatorRef, donationRef, jsonEscaped] = m;
  let doc;
  try {
    doc = JSON.parse(unquote(jsonEscaped));
  } catch (e) {
    check(`row ${slug}: jsonb parses`, false, e.message);
    continue;
  }
  check(`row ${slug}: jsonb parses`, true);
  check(`row ${slug}: published`, published === 'true');
  check(`row ${slug}: sort_order numeric`, Number.isInteger(Number(sortOrder)));
  check(`row ${slug}: tag_ids populated`, tags.split(',').length === 6, tags);
  check(`row ${slug}: curator resolved by slug, not a hard-coded uuid`,
    curatorRef.includes("slug = 'mykhailo'"), curatorRef);
  check(`row ${slug}: donation resolved by slug`,
    donationRef.includes("slug = 'kotik-bog'"), donationRef);
  check(`row ${slug}: name survived escaping`, doc.name.ru === 'Котик');
  check(`row ${slug}: Georgian survived`, doc.name.ka === 'კოტიკი');
  check(`row ${slug}: full story survived`, doc.description.ru.length > 1500,
    `${doc.description.ru.length} chars`);
  check(`row ${slug}: apostrophes escaped correctly`, doc.description.en.includes('wasn’t'));
  check(`row ${slug}: gallery has 7 items`, doc.gallery.length === 7);
  check(`row ${slug}: doc stores tag ids only`,
    Array.isArray(doc.tags) && doc.tags.every((t) => typeof t === 'string'), JSON.stringify(doc.tags));
  check(`row ${slug}: no duplicated slug/curator/donation inside doc`,
    doc.slug === undefined && doc.curatorSlug === undefined && doc.donationSlug === undefined);
  check(`row ${slug}: description byte-identical to data/pets.js`,
    doc.description.ru === SRC.PETS_SEED[0].description.ru);
}
check('exactly one pet row', rows === 1, `${rows} rows`);

console.log('\ncatalogue rows match data/pets.js');
{
  const tagIds = [...seed.matchAll(/^ {2}\('([a-z0-9-]+)', '(?:[^']|'')*'::jsonb\)/gm)].map((x) => x[1]);
  check('every seed tag is emitted',
    SRC.TAGS_SEED.every((t) => tagIds.includes(t.id)),
    `emitted ${tagIds.length}, source ${SRC.TAGS_SEED.length}`);

  check('curator email emitted', seed.includes("'innosanctum@gmail.com'"));
  check('curator telegram emitted', seed.includes("'https://t.me/innosanctum'"));
  check('donation url emitted', seed.includes("'https://egreve.bog.ge/For_Kotik'"));
  check("bank's own QR image preserved", seed.includes("'assets/qr_code.png'"));
  check('curator name is jsonb, not a bare string', /'\{"ru":"Михаил[^']*\}'::jsonb/.test(seed));
}

console.log('\nschema.sql sanity');
check('dollar-quoted blocks are balanced', (schema.match(/\$\$/g) || []).length % 2 === 0,
  `${(schema.match(/\$\$/g) || []).length} markers`);
check('preflight guards a mismatched pets table', /A "pets" table already exists/.test(schema));
check('RLS enabled on pets', /alter table public\.pets\s+enable row level security/.test(schema));
check('RLS enabled on admins', /alter table public\.admins\s+enable row level security/.test(schema));
check('RLS enabled on the allowlist',
  /alter table public\.admin_ip_allowlist enable row level security/.test(schema));
check('RLS enabled on the new catalogues',
  /alter table public\.%I enable row level security/.test(schema));
check('anonymous SELECT limited to published pets',
  /create policy "public reads published pets"[\s\S]*?using \(published = true\)/.test(schema));
check('catalogues are publicly readable', /public reads %1\$s/.test(schema));
check('catalogue writes require is_admin', /admins write %1\$s[\s\S]*?is_admin\(\)/.test(schema));
check('every write policy goes through is_admin()',
  (schema.match(/public\.is_admin\(\)/g) || []).length >= 8,
  `${(schema.match(/public\.is_admin\(\)/g) || []).length} uses`);
check('is_admin is security definer', /function public\.is_admin\(\)[\s\S]*?security definer/.test(schema));
check('ip_allowed is security definer (else RLS hides the allowlist)',
  /function public\.ip_allowed\(\)[\s\S]*?security definer/.test(schema));
check('search_path pinned on definer functions',
  (schema.match(/set search_path = public, pg_temp/g) || []).length >= 2);
check('slug is constrained', /check \(slug ~ /.test(schema));
check('tag id is constrained', /check \(id ~ /.test(schema));
check('tag_ids has a GIN index', /using gin \(tag_ids\)/.test(schema));
check('curator FK uses set null, never cascade',
  /curator_id\s+uuid references public\.curators\(id\)\s+on delete set null/.test(schema));
check('donation FK uses set null', /donation_id uuid references public\.donation_links\(id\) on delete set null/.test(schema));
check('storage bucket created', /insert into storage\.buckets/.test(schema));
check('storage writes are admin-only',
  /create policy "admins write pet media"[\s\S]*?is_admin\(\)/.test(schema));
check('no policy grants write to anon',
  !/for (insert|update|delete)[\s\S]{0,120}?to anon/.test(schema));
check('x-forwarded-for empty-string trap handled', /nullif\(btrim\(split_part/.test(schema));

console.log(fails === 0 ? '\nAll SQL checks passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
