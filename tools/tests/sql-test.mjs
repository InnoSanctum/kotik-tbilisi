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

console.log('\nseed.sql structure');
check('is an upsert on slug', /on conflict \(slug\) do update set/.test(seed));
check('targets the pets table', /insert into public\.pets \(slug, published, sort_order, tag_ids, doc\)/.test(seed));
check('bumps updated_at', /updated_at = now\(\)/.test(seed));

/* Pull each row's jsonb literal back out, undo the SQL quote-doubling, and
   confirm it is still valid JSON carrying the real content. */
console.log('\nseed.sql jsonb payload round-trips');
const rowRe = /\('([a-z0-9-]+)', (true|false), (\d+), ARRAY\[([^\]]*)\]::text\[\], '((?:[^']|'')*)'::jsonb\)/g;
let m, rows = 0;
while ((m = rowRe.exec(seed)) !== null) {
  rows++;
  const [, slug, published, sortOrder, tags, jsonEscaped] = m;
  let doc;
  try {
    doc = JSON.parse(jsonEscaped.replace(/''/g, "'"));
  } catch (e) {
    check(`row ${slug}: jsonb parses`, false, e.message);
    continue;
  }
  check(`row ${slug}: jsonb parses`, true);
  check(`row ${slug}: published flag`, published === 'true');
  check(`row ${slug}: sort_order is a number`, Number.isInteger(Number(sortOrder)));
  check(`row ${slug}: tag_ids populated`, tags.split(',').length === 6, tags);
  check(`row ${slug}: name survived escaping`, doc.name.ru === 'Котик');
  check(`row ${slug}: Georgian survived`, doc.name.ka === 'კოტიკი');
  check(`row ${slug}: full story survived`, doc.description.ru.length > 1500,
    `${doc.description.ru.length} chars`);
  check(`row ${slug}: apostrophes escaped correctly`,
    doc.description.en.includes('wasn’t') || doc.description.en.includes("wasn't"));
  check(`row ${slug}: gallery has 7 items`, doc.gallery.length === 7);
  check(`row ${slug}: slug not duplicated inside doc`, doc.slug === undefined);
  check(`row ${slug}: donate url intact`, doc.donate.url === 'https://egreve.bog.ge/For_Kotik');
}
check('exactly one row generated', rows === 1, `${rows} rows`);

/* The seed must not drift from data/pets.js. */
console.log('\nseed.sql matches data/pets.js');
{
  const sandbox = { window: {} };
  runInNewContext(readFileSync(join(ROOT, 'data/pets.js'), 'utf8'), sandbox);
  const source = sandbox.window.PETS_SEED;
  rowRe.lastIndex = 0;
  const parsed = [];
  while ((m = rowRe.exec(seed)) !== null) {
    parsed.push({ slug: m[1], doc: JSON.parse(m[5].replace(/''/g, "'")) });
  }
  check('same number of pets', parsed.length === source.length);
  check('same slugs', parsed[0].slug === source[0].slug);
  check('description byte-identical',
    parsed[0].doc.description.ru === source[0].description.ru);
  check('care plan identical',
    JSON.stringify(parsed[0].doc.carePlan) === JSON.stringify(source[0].carePlan));
}

console.log('\nschema.sql sanity');
check('dollar-quoted blocks are balanced', (schema.match(/\$\$/g) || []).length % 2 === 0,
  `${(schema.match(/\$\$/g) || []).length} markers`);
check('RLS enabled on pets', /alter table public\.pets\s+enable row level security/.test(schema));
check('RLS enabled on admins', /alter table public\.admins\s+enable row level security/.test(schema));
check('RLS enabled on the allowlist',
  /alter table public\.admin_ip_allowlist enable row level security/.test(schema));
check('anonymous SELECT is limited to published rows',
  /create policy "public reads published pets"[\s\S]*?using \(published = true\)/.test(schema));
check('every write policy goes through is_admin()',
  (schema.match(/public\.is_admin\(\)/g) || []).length >= 8,
  `${(schema.match(/public\.is_admin\(\)/g) || []).length} uses`);
check('is_admin is security definer', /function public\.is_admin\(\)[\s\S]*?security definer/.test(schema));
check('ip_allowed is security definer (else RLS hides the allowlist)',
  /function public\.ip_allowed\(\)[\s\S]*?security definer/.test(schema));
check('search_path pinned on definer functions',
  (schema.match(/set search_path = public, pg_temp/g) || []).length >= 2);
check('slug is constrained', /check \(slug ~ /.test(schema));
check('tag_ids has a GIN index', /using gin \(tag_ids\)/.test(schema));
check('storage bucket created', /insert into storage\.buckets/.test(schema));
check('storage writes are admin-only',
  /create policy "admins write pet media"[\s\S]*?is_admin\(\)/.test(schema));
check('no policy grants write to anon',
  !/for (insert|update|delete)[\s\S]{0,120}?to anon/.test(schema));
check('x-forwarded-for empty-string trap handled',
  /nullif\(btrim\(split_part/.test(schema));

console.log(fails === 0 ? '\nAll SQL checks passed.' : `\n${fails} FAILURE(S)`);
process.exit(fails ? 1 : 0);
