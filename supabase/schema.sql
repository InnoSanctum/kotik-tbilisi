-- =====================================================================
-- Pet fundraising site — database schema, security policies, and storage.
--
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- then follow the "Database setup" section of README.md to create the admin
-- user and load the seed data.
--
-- The security model in one paragraph: the browser ships a public anon key, so
-- assume anyone can send any request they like. Postgres, not JavaScript, is
-- what decides who may do what. Anonymous callers can read published pets and
-- nothing else. Writing requires a JWT whose user id appears in `admins` AND —
-- when the allowlist is non-empty — a request coming from an allowed IP.
-- Tampering with the admin page in devtools gets you a 403 from the database.
-- =====================================================================

-- ------------------------------------------------------------- preflight

-- `create table if not exists` below would SILENTLY DO NOTHING if a table
-- called `pets` already exists with different columns — which is exactly what
-- you get after clicking "New table" in the Table Editor, since that creates
-- one with only `id` and `created_at`. The script would then appear to succeed
-- while the site kept failing with "column pets.slug does not exist".
--
-- So: stop with an explanation instead.
do $$
begin
  if to_regclass('public.pets') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'pets' and column_name = 'slug'
     )
  then
    raise exception using
      errcode = 'invalid_table_definition',
      message = 'A "pets" table already exists but is not the one this site expects.',
      hint    = 'If it holds nothing you need, drop it and run this script again: '
                'drop table public.pets cascade;';
  end if;
end
$$;

-- ---------------------------------------------------------------- tables

create table if not exists public.pets (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              -- Slugs end up in URLs (pet.html?slug=…), so keep them boring.
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  published   boolean not null default false,
  sort_order  integer not null default 0,

  -- Denormalised copy of the tag ids from `doc`, so tag filtering can use an
  -- index instead of digging through jsonb on every row.
  tag_ids     text[] not null default '{}',

  -- Everything else: names, descriptions, gallery, curator, donation details.
  -- jsonb rather than 30 columns because every human-readable field is a
  -- {lang: text} map, and adding a language must never require a migration.
  doc         jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.pets.doc is
  'Localised body of the record. Text fields are {"ru": "...", "en": "..."} maps; missing languages fall back to Russian at render time.';

create index if not exists pets_published_sort_idx
  on public.pets (published, sort_order);

create index if not exists pets_tag_ids_idx
  on public.pets using gin (tag_ids);

-- Who is allowed to edit. Deliberately a table rather than a role check: the
-- brief is one admin, but adding a second later is then a single INSERT.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- Optional IP allowlist for admin writes.
--
-- Leave this table EMPTY and the allowlist is simply off — password auth alone
-- guards the admin. Insert even one row and every write must additionally come
-- from a matching address. Use CIDR notation: a single address is /32.
create table if not exists public.admin_ip_allowlist (
  id         uuid primary key default gen_random_uuid(),
  cidr       cidr not null,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.admin_ip_allowlist is
  'Empty table = allowlist disabled. Any row = admin writes are restricted to those CIDR ranges. Careful: locking yourself out means fixing it from the SQL editor.';

-- ------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pets_touch_updated_at on public.pets;
create trigger pets_touch_updated_at
  before update on public.pets
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- ip helpers

-- The caller's IP as seen by the API gateway.
--
-- PostgREST exposes the request headers as a JSON setting. X-Forwarded-For may
-- be a chain ("client, proxy1, proxy2"); the left-most entry is the original
-- client. Anything unparseable yields NULL, which the policy below treats as
-- "not on the list".
create or replace function public.request_ip()
returns inet
language plpgsql
stable
as $$
declare
  headers json;
  raw     text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;

  if headers is null then
    return null;
  end if;

  -- nullif around split_part matters: split_part('', ',', 1) returns an empty
  -- string, not NULL, so without it coalesce would stop there and never reach
  -- x-real-ip.
  raw := coalesce(
    nullif(btrim(coalesce(headers ->> 'cf-connecting-ip', '')), ''),
    nullif(btrim(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(btrim(coalesce(headers ->> 'x-real-ip', '')), '')
  );

  raw := nullif(btrim(raw), '');
  if raw is null then
    return null;
  end if;

  begin
    return raw::inet;
  exception when others then
    return null;
  end;
end;
$$;

-- security definer is load-bearing, not decoration. admin_ip_allowlist has RLS
-- on and no policies, so an invoker-rights function would see ZERO rows for a
-- normal user — making "no rows configured" true and silently disabling the
-- allowlist for exactly the people it is meant to stop. Running as the owner
-- lets it read the real table.
create or replace function public.ip_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- No rows configured => the allowlist is switched off entirely.
  select
    not exists (select 1 from public.admin_ip_allowlist)
    or exists (
      select 1
      from public.admin_ip_allowlist a
      where public.request_ip() is not null
        and public.request_ip() <<= a.cidr
    );
$$;

-- The single predicate every write policy uses.
-- security definer so it can read `admins` regardless of the caller's own
-- permissions; search_path is pinned so it cannot be tricked by a shadowed
-- table on a hostile search_path.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and exists (select 1 from public.admins where user_id = auth.uid())
    and public.ip_allowed();
$$;

-- --------------------------------------------------------------- policies

alter table public.pets               enable row level security;
alter table public.admins             enable row level security;
alter table public.admin_ip_allowlist enable row level security;

-- Visitors: read published records only. Drafts stay invisible until you
-- tick "Published" in the admin.
drop policy if exists "public reads published pets" on public.pets;
create policy "public reads published pets"
  on public.pets
  for select
  to anon, authenticated
  using (published = true);

-- Admins: full read, including drafts.
drop policy if exists "admins read all pets" on public.pets;
create policy "admins read all pets"
  on public.pets
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins insert pets" on public.pets;
create policy "admins insert pets"
  on public.pets
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update pets" on public.pets;
create policy "admins update pets"
  on public.pets
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete pets" on public.pets;
create policy "admins delete pets"
  on public.pets
  for delete
  to authenticated
  using (public.is_admin());

-- The admin roster and the allowlist are never client-editable. Managing them
-- from the SQL editor is a feature: a compromised browser session cannot add a
-- new admin or widen the IP allowlist.
drop policy if exists "admins read roster" on public.admins;
create policy "admins read roster"
  on public.admins
  for select
  to authenticated
  using (user_id = auth.uid());

-- No policies at all on admin_ip_allowlist => RLS denies every client request.
-- Only the service role (SQL editor, server-side keys) can touch it.

-- ---------------------------------------------------------------- storage

-- Bucket for photos and documents uploaded through the admin. Public read so
-- the site can serve images straight from the CDN; writes are admin-only.
insert into storage.buckets (id, name, public)
values ('pet-media', 'pet-media', true)
on conflict (id) do update set public = true;

drop policy if exists "public reads pet media" on storage.objects;
create policy "public reads pet media"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'pet-media');

drop policy if exists "admins write pet media" on storage.objects;
create policy "admins write pet media"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'pet-media' and public.is_admin());

drop policy if exists "admins update pet media" on storage.objects;
create policy "admins update pet media"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'pet-media' and public.is_admin())
  with check (bucket_id = 'pet-media' and public.is_admin());

drop policy if exists "admins delete pet media" on storage.objects;
create policy "admins delete pet media"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'pet-media' and public.is_admin());

-- =====================================================================
-- Next steps (see README.md "Database setup"):
--
--   1. Authentication -> Users -> "Add user" to create the single admin.
--      Use a long, unique password; there is no rate-limit worth trusting
--      on a guessable one.
--
--   2. Register that user as an admin:
--        insert into public.admins (user_id, note)
--        select id, 'site admin' from auth.users where email = 'you@example.com';
--
--   3. Load the pet records:
--        node tools/make_seed.mjs > supabase/seed.sql
--      then paste supabase/seed.sql into the SQL editor and run it.
--
--   4. Optional — turn on the IP allowlist:
--        insert into public.admin_ip_allowlist (cidr, note)
--        values ('203.0.113.42/32', 'home');
--      Verify you can still save BEFORE closing the SQL editor. If you lock
--      yourself out, `delete from public.admin_ip_allowlist;` undoes it.
--
--   5. Put the project URL and the anon key into config.js.
-- =====================================================================
