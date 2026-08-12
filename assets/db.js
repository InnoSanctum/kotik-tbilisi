/*
 * Data access.
 *
 * Public pages talk to Supabase over plain REST (PostgREST), so they carry no
 * SDK and no build step — a <script> tag and fetch() is the whole dependency
 * list. Only the admin needs sign-in, and that is another handful of REST
 * calls in assets/auth.js.
 *
 * Reads degrade instead of failing: no project configured, offline, or the
 * project asleep on the free tier all end up rendering window.PETS_SEED with a
 * `stale` flag the pages surface as a small banner.
 *
 * Four tables (see supabase/schema.sql):
 *   pets            - the animals; localised body in a jsonb `doc`
 *   tags            - stable id + label per language
 *   curators        - the people; one looks after several animals
 *   donation_links  - where the money goes
 *
 * Pets reference the other three rather than copying them, so correcting a
 * Telegram handle or renaming a tag fixes every animal at once. The catalogues
 * are also what the admin offers as autocomplete suggestions.
 *
 * Rows are fetched with `select=*` on purpose. A column list would break the
 * whole page the moment the database is a migration behind the site, which on
 * a project deployed by copy-pasting SQL is a matter of when, not if.
 */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var sb = cfg.supabase || {};
  var URL_BASE = (sb.url || '').replace(/\/+$/, '');
  var ANON = sb.anonKey || '';
  var CONFIGURED = !!(URL_BASE && ANON);
  var ALLOW_FALLBACK = cfg.fallbackToStaticData !== false;

  var REQUEST_TIMEOUT = 8000;

  /* --------------------------------------------------------- normalising */

  function asMap(value) {
    /* Localised fields must always reach the renderers as a {lang: text} map,
       whether they arrive that way or as a bare legacy string. */
    if (value === null || value === undefined) return {};
    if (typeof value === 'string') {
      var out = {};
      out[window.I18N ? window.I18N.FALLBACK : 'ru'] = value;
      return out;
    }
    return value;
  }

  function slugifyTag(text) {
    if (window.PetSlug) return window.PetSlug.slugify(text) || 'tag';
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
  }

  /*
   * A pet's tag entry may be:
   *   'fiv'                        an id, when the label lives in the catalogue
   *   'Стерилизован'               a label, for a tag not in the catalogue yet
   *   {id: 'fiv', ru: '…', …}      the full thing
   *
   * A bare string is ambiguous, so it is treated as an id when the catalogue
   * knows it and as a label otherwise. The catalogue wins over an inline
   * label: renaming a tag there is meant to rename it everywhere.
   */
  function normaliseTag(tag, index, catalogue) {
    var known = catalogue || {};
    var base;

    if (typeof tag === 'string') {
      base = known[tag] ? Object.assign({}, known[tag])
                        : { id: slugifyTag(tag), ru: tag, en: tag, ka: tag };
    } else if (tag && typeof tag === 'object') {
      base = Object.assign({}, tag);
      if (!base.id) base.id = slugifyTag(base.ru || base.en || base.ka || ('tag-' + index));
      if (known[base.id]) base = Object.assign(base, known[base.id]);
    } else {
      return null;
    }
    return base;
  }

  function normaliseMedia(item) {
    if (!item) return null;
    var m = Object.assign({}, item);
    m.type = m.type || 'image';
    m.alt = asMap(m.alt);
    if (!m.thumb) m.thumb = m.src;
    return m;
  }

  function normaliseCurator(source) {
    var c = source || {};
    return {
      slug: c.slug || '',
      name: asMap(c.name),
      photo: c.photo || '',
      photoAlt: asMap(c.photoAlt || c.photo_alt),
      bio: asMap(c.bio),
      email: c.email || '',
      telegram: c.telegram || '',
      instagram: c.instagram || '',
      phone: c.phone || ''
    };
  }

  function normaliseDonation(source) {
    var d = source || {};
    return {
      slug: d.slug || '',
      url: d.url || '',
      qr: d.qr || '',
      label: asMap(d.label),
      note: asMap(d.note)
    };
  }

  /*
   * Catalogue tags arrive in two shapes and must leave in one.
   *
   *   database row : {id: 'fiv', label: {ru: '…', en: '…'}}
   *   seed entry   : {id: 'fiv', ru: '…', en: '…'}
   *
   * Everything downstream — pickers, filters, i18n.pick() — expects the flat
   * form, so the row's `label` is spread up to the top level here. Without
   * this every tag from a real database renders as its bare id.
   */
  function normaliseCatalogueTag(row) {
    if (!row || !row.id) return null;
    var out = { id: row.id };
    var label = row.label && typeof row.label === 'object' ? row.label : row;
    Object.keys(label).forEach(function (key) {
      if (key !== 'id' && key !== 'label' && key !== 'created_at' && label[key]) {
        out[key] = label[key];
      }
    });
    return out;
  }

  /* Index a catalogue by id and by slug so either kind of reference resolves. */
  function indexBy(rows, key) {
    var out = {};
    (rows || []).forEach(function (row) {
      if (row && row[key]) out[row[key]] = row;
    });
    return out;
  }

  function buildContext(catalogues) {
    var c = catalogues || {};
    return {
      tags: indexBy(c.tags, 'id'),
      curatorsById: indexBy(c.curators, 'id'),
      curatorsBySlug: indexBy(c.curators, 'slug'),
      donationsById: indexBy(c.donations, 'id'),
      donationsBySlug: indexBy(c.donations, 'slug')
    };
  }

  /* One shape for renderers, whether the row came from Postgres or the seed. */
  function normalisePet(raw, ctx) {
    if (!raw) return null;
    ctx = ctx || buildContext({});

    /* A database row keeps the body in `doc`; a seed entry is already flat. */
    var doc = raw.doc && typeof raw.doc === 'object' ? raw.doc : raw;

    var gallery = (doc.gallery || []).map(normaliseMedia).filter(Boolean);
    var main = normaliseMedia(doc.mainPhoto || doc.main_photo) || gallery[0] || null;

    /* The main photo doubles as the first gallery slide, but only if it isn't
       already in there — otherwise the first photo shows up twice. */
    if (main && !gallery.some(function (g) { return g.src === main.src; })) {
      gallery.unshift(main);
    }

    /* Resolve the shared records: a foreign key first, then a slug reference
       from the static seed, then anything stored inline on older records. */
    var curatorSource =
      (raw.curator_id && ctx.curatorsById[raw.curator_id]) ||
      ((doc.curatorSlug || raw.curator_slug) && ctx.curatorsBySlug[doc.curatorSlug || raw.curator_slug]) ||
      doc.curator || null;

    var donationSource =
      (raw.donation_id && ctx.donationsById[raw.donation_id]) ||
      ((doc.donationSlug || raw.donation_slug) && ctx.donationsBySlug[doc.donationSlug || raw.donation_slug]) ||
      doc.donate || null;

    var tagList = doc.tags || raw.tag_ids || [];

    return {
      slug: raw.slug || doc.slug || '',
      published: raw.published !== undefined ? !!raw.published
               : (doc.published !== undefined ? !!doc.published : true),
      sortOrder: raw.sort_order !== undefined ? raw.sort_order : (doc.sortOrder || 0),

      name: asMap(doc.name),
      subtitle: asMap(doc.subtitle),
      location: asMap(doc.location),
      status: asMap(doc.status),
      statusType: doc.statusType || doc.status_type || 'info',

      tags: tagList.map(function (t, i) { return normaliseTag(t, i, ctx.tags); }).filter(Boolean),

      mainPhoto: main,
      gallery: gallery,

      shortDescription: asMap(doc.shortDescription || doc.short_description),
      description: asMap(doc.description),

      video: doc.video && (doc.video.id || doc.video.src) ? doc.video : null,

      carePlan: (doc.carePlan || doc.care_plan || []).map(function (step) {
        return {
          state: step.state === 'done' ? 'done' : 'needed',
          title: asMap(step.title),
          desc: asMap(step.desc)
        };
      }),

      docs: (doc.docs || []).map(function (d) {
        return { href: d.href, label: asMap(d.label), sub: asMap(d.sub) };
      }),

      donate: normaliseDonation(donationSource),
      curator: normaliseCurator(curatorSource),

      /* Kept so the admin can re-select the same records without guessing. */
      curatorId: raw.curator_id || null,
      donationId: raw.donation_id || null,

      sections: (doc.sections || []).map(function (s) {
        return { icon: s.icon || 'fa-circle-info', title: asMap(s.title), body: asMap(s.body) };
      })
    };
  }

  /* Renderer shape -> database row. Used by the admin when saving. */
  function toRow(pet) {
    var doc = Object.assign({}, pet);
    /* These live in real columns; a copy inside `doc` would be a second,
       silently diverging source of truth. */
    delete doc.slug;
    delete doc.published;
    delete doc.sortOrder;
    delete doc.curator;
    delete doc.curatorId;
    delete doc.donate;
    delete doc.donationId;
    delete doc.mainPhoto;   // rebuilt from gallery[0] on load

    /* Store tag ids only; labels belong to the tags table. */
    doc.tags = (pet.tags || []).map(function (t) {
      return typeof t === 'string' ? t : t.id;
    }).filter(Boolean);

    return {
      slug: pet.slug,
      published: !!pet.published,
      sort_order: pet.sortOrder || 0,
      tag_ids: doc.tags,
      curator_id: pet.curatorId || null,
      donation_id: pet.donationId || null,
      doc: doc
    };
  }

  /* -------------------------------------------------------------- fetch */

  function restUrl(path) { return URL_BASE + '/rest/v1/' + path; }

  function headers(extra) {
    var h = {
      apikey: ANON,
      Authorization: 'Bearer ' + (window.PetAuth && window.PetAuth.accessToken() || ANON)
    };
    return Object.assign(h, extra || {});
  }

  /*
   * Always returns a promise — never throws.
   *
   * The fallback below is a .catch() chain, and a *synchronous* throw walks
   * straight past it: the page then breaks completely instead of quietly
   * rendering the static seed, which defeats the whole point of having one.
   * So everything that could throw before the first await lives in this try.
   */
  function request(path, options) {
    try {
      if (typeof fetch !== 'function') {
        throw new Error('fetch is unavailable in this environment');
      }

      options = options || {};
      /* Assign the caller's options FIRST, then overwrite `headers` with the
         merged set. Doing it the other way round lets a caller that passes its
         own headers (savePet sends Content-Type and Prefer) clobber apikey and
         Authorization, and every write silently goes out unauthenticated. */
      var opts = Object.assign({}, options);
      opts.headers = headers(options.headers);

      /* Free-tier projects can be cold; a hung request should fall back rather
         than leave the page on a spinner forever. */
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) {
        opts.signal = controller.signal;
        setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);
      }

      return fetch(restUrl(path), opts).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            var err = new Error('Supabase ' + res.status + ': ' + body);
            err.status = res.status;
            throw err;
          });
        }
        return res.status === 204 ? null : res.json();
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /* --------------------------------------------------------------- seed */

  function seedCatalogues() {
    return {
      tags: (window.TAGS_SEED || []).map(normaliseCatalogueTag).filter(Boolean),
      curators: (window.CURATORS_SEED || []).slice(),
      donations: (window.DONATIONS_SEED || []).slice()
    };
  }

  function bySortOrder(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); }

  function seedPets(includeDrafts) {
    var ctx = buildContext(seedCatalogues());
    return (window.PETS_SEED || [])
      .map(function (p) { return normalisePet(p, ctx); })
      .filter(function (p) { return p && (includeDrafts || p.published); })
      .sort(bySortOrder);
  }

  /* ------------------------------------------------------------- public */

  /*
   * The three catalogues, fetched together.
   *
   * A failure here is not fatal and does not mark the pets stale: the site
   * falls back to the seeded catalogues, and a pet whose tag label cannot be
   * resolved still renders with its inline label or its id.
   */
  function loadCatalogues() {
    if (!CONFIGURED) return Promise.resolve(seedCatalogues());

    var fetchOne = function (path, key) {
      return request(path).catch(function (err) {
        console.warn('[db] ' + key + ' unavailable, using seed: ' + err.message);
        return null;
      });
    };

    return Promise.all([
      fetchOne('tags?select=*', 'tags'),
      fetchOne('curators?select=*', 'curators'),
      fetchOne('donation_links?select=*', 'donation_links')
    ]).then(function (results) {
      var seed = seedCatalogues();
      return {
        tags: (results[0] || seed.tags).map(normaliseCatalogueTag).filter(Boolean),
        curators: results[1] || seed.curators,
        donations: results[2] || seed.donations
      };
    });
  }

  /* Resolves to { pets, catalogues, stale, source } — never rejects, so a page
     can render something in every circumstance. */
  function listPets(opts) {
    var includeDrafts = !!(opts && opts.includeDrafts);

    if (!CONFIGURED) {
      return Promise.resolve({
        pets: seedPets(includeDrafts),
        catalogues: seedCatalogues(),
        stale: false,
        source: 'seed'
      });
    }

    var query = 'pets?select=*&order=sort_order.asc';
    if (!includeDrafts) query += '&published=eq.true';

    /* Promise.resolve().then(…) so that even a synchronous throw while setting
       the request up lands in the .catch below and falls back to the seed. */
    return Promise.resolve().then(loadCatalogues).then(function (catalogues) {
      var ctx = buildContext(catalogues);
      return request(query).then(function (rows) {
        return {
          pets: (rows || []).map(function (r) { return normalisePet(r, ctx); }).filter(Boolean),
          catalogues: catalogues,
          stale: false,
          source: 'supabase'
        };
      });
    }).catch(function (err) {
      if (!ALLOW_FALLBACK) throw err;
      console.warn('[db] falling back to static seed:', err.message);
      return {
        pets: seedPets(includeDrafts),
        catalogues: seedCatalogues(),
        stale: true,
        source: 'seed'
      };
    });
  }

  function getPet(slug) {
    return listPets({ includeDrafts: false }).then(function (result) {
      var found = null;
      for (var i = 0; i < result.pets.length; i++) {
        if (result.pets[i].slug === slug) { found = result.pets[i]; break; }
      }
      return { pet: found, stale: result.stale, source: result.source };
    });
  }

  function siteContent() { return window.SITE_CONTENT || {}; }

  /* ------------------------------------------------------- writes (admin) */

  function upsert(table, row, conflictColumn) {
    if (!CONFIGURED) return Promise.reject(new Error('not-configured'));
    return request(table + '?on_conflict=' + conflictColumn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(row)
    });
  }

  function savePet(pet) { return upsert('pets', toRow(pet), 'slug'); }

  function deletePet(slug) {
    if (!CONFIGURED) return Promise.reject(new Error('not-configured'));
    return request('pets?slug=eq.' + encodeURIComponent(slug), { method: 'DELETE' });
  }

  function saveCurator(curator) {
    return upsert('curators', {
      slug: curator.slug,
      name: curator.name || {},
      bio: curator.bio || {},
      photo: curator.photo || null,
      photo_alt: curator.photoAlt || {},
      email: curator.email || null,
      telegram: curator.telegram || null,
      instagram: curator.instagram || null,
      phone: curator.phone || null
    }, 'slug');
  }

  function saveDonation(donation) {
    return upsert('donation_links', {
      slug: donation.slug,
      url: donation.url,
      label: donation.label || {},
      note: donation.note || {},
      qr: donation.qr || null
    }, 'slug');
  }

  /* Tags are written in bulk: saving a pet may introduce several at once. */
  function saveTags(tags) {
    var rows = (tags || []).filter(function (t) { return t && t.id; }).map(function (t) {
      var label = {};
      Object.keys(t).forEach(function (k) { if (k !== 'id' && t[k]) label[k] = t[k]; });
      return { id: t.id, label: label };
    });
    if (!rows.length) return Promise.resolve([]);
    return upsert('tags', rows, 'id');
  }

  function deleteFrom(table, column, value) {
    if (!CONFIGURED) return Promise.reject(new Error('not-configured'));
    return request(table + '?' + column + '=eq.' + encodeURIComponent(value), { method: 'DELETE' });
  }

  window.PetDB = {
    configured: CONFIGURED,
    urlBase: URL_BASE,
    anonKey: ANON,

    listPets: listPets,
    getPet: getPet,
    loadCatalogues: loadCatalogues,
    siteContent: siteContent,

    savePet: savePet,
    deletePet: deletePet,
    saveCurator: saveCurator,
    saveDonation: saveDonation,
    saveTags: saveTags,
    deleteCurator: function (slug) { return deleteFrom('curators', 'slug', slug); },
    deleteDonation: function (slug) { return deleteFrom('donation_links', 'slug', slug); },
    deleteTag: function (id) { return deleteFrom('tags', 'id', id); },

    normalisePet: normalisePet,
    normaliseTag: normaliseTag,
    normaliseCatalogueTag: normaliseCatalogueTag,
    normaliseCurator: normaliseCurator,
    normaliseDonation: normaliseDonation,
    buildContext: buildContext,
    toRow: toRow,
    seedPets: seedPets,
    seedCatalogues: seedCatalogues
  };
})();
