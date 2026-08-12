/*
 * Data access.
 *
 * Public pages talk to Supabase over plain REST (PostgREST), so they carry no
 * SDK and no build step — a <script> tag and fetch() is the whole dependency
 * list. Only admin.html loads the Supabase SDK, because sign-in and file
 * uploads genuinely need it.
 *
 * Reads degrade instead of failing: no project configured, offline, or the
 * project asleep on the free tier all end up rendering window.PETS_SEED with a
 * `stale` flag the pages surface as a small banner.
 *
 * Storage layout (see supabase/schema.sql): a few first-class columns for the
 * things Postgres should index — slug, published, sort_order, tag_ids — and a
 * jsonb `doc` holding the localised body. That keeps adding a language or a
 * field a pure data change, with no migration.
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

  function normaliseTag(tag, i) {
    if (typeof tag === 'string') {
      /* Bare string: it is its own id and its own label. */
      return { id: slugifyTag(tag), ru: tag, en: tag, ka: tag };
    }
    var t = Object.assign({}, tag);
    if (!t.id) t.id = slugifyTag(t.ru || t.en || t.ka || ('tag-' + i));
    return t;
  }

  function slugifyTag(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'tag';
  }

  function normaliseMedia(item) {
    if (!item) return null;
    var m = Object.assign({}, item);
    m.type = m.type || 'image';
    m.alt = asMap(m.alt);
    if (!m.thumb) m.thumb = m.src;
    return m;
  }

  /* One shape for renderers, whether the row came from Postgres or the seed. */
  function normalisePet(raw) {
    if (!raw) return null;

    /* A database row keeps the body in `doc`; a seed entry is already flat. */
    var doc = raw.doc && typeof raw.doc === 'object' ? raw.doc : raw;

    var gallery = (doc.gallery || []).map(normaliseMedia).filter(Boolean);
    var main = normaliseMedia(doc.mainPhoto || doc.main_photo) ||
               gallery[0] || null;

    /* The main photo doubles as the first gallery slide, but only if it isn't
       already in there — otherwise the first photo shows up twice. */
    if (main && !gallery.some(function (g) { return g.src === main.src; })) {
      gallery.unshift(main);
    }

    var donate = doc.donate || {};
    var curator = doc.curator || {};

    return {
      slug: raw.slug || doc.slug || '',
      published: raw.published !== undefined ? !!raw.published
               : (doc.published !== undefined ? !!doc.published : true),
      sortOrder: raw.sort_order !== undefined ? raw.sort_order
               : (doc.sortOrder || 0),

      name: asMap(doc.name),
      subtitle: asMap(doc.subtitle),
      location: asMap(doc.location),
      status: asMap(doc.status),
      statusType: doc.statusType || doc.status_type || 'info',

      tags: (doc.tags || []).map(normaliseTag),

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

      donate: {
        url: donate.url || '',
        qr: donate.qr || '',
        label: asMap(donate.label),
        note: asMap(donate.note)
      },

      curator: {
        name: asMap(curator.name),
        photo: curator.photo || '',
        photoAlt: asMap(curator.photoAlt || curator.photo_alt),
        bio: asMap(curator.bio),
        email: curator.email || '',
        telegram: curator.telegram || '',
        instagram: curator.instagram || '',
        phone: curator.phone || ''
      },

      sections: (doc.sections || []).map(function (s) {
        return { icon: s.icon || 'fa-circle-info', title: asMap(s.title), body: asMap(s.body) };
      })
    };
  }

  /* Renderer shape -> database row. Used by the admin when saving. */
  function toRow(pet) {
    var doc = Object.assign({}, pet);
    delete doc.slug;
    delete doc.published;
    delete doc.sortOrder;
    return {
      slug: pet.slug,
      published: !!pet.published,
      sort_order: pet.sortOrder || 0,
      tag_ids: (pet.tags || []).map(function (t) { return t.id; }),
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

  function request(path, options) {
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
  }

  /* --------------------------------------------------------------- seed */

  function seedPets() {
    return (window.PETS_SEED || []).map(normalisePet).filter(Boolean);
  }

  function bySortOrder(a, b) {
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  }

  /* ------------------------------------------------------------- public */

  /* Resolves to { pets, stale, source } — never rejects, so a page can render
     something in every circumstance. */
  function listPets(opts) {
    var includeDrafts = !!(opts && opts.includeDrafts);

    if (!CONFIGURED) {
      return Promise.resolve({
        pets: seedPets().filter(function (p) { return includeDrafts || p.published; }).sort(bySortOrder),
        stale: false,
        source: 'seed'
      });
    }

    var query = 'pets?select=slug,published,sort_order,tag_ids,doc&order=sort_order.asc';
    if (!includeDrafts) query += '&published=eq.true';

    return request(query)
      .then(function (rows) {
        return {
          pets: (rows || []).map(normalisePet).filter(Boolean),
          stale: false,
          source: 'supabase'
        };
      })
      .catch(function (err) {
        if (!ALLOW_FALLBACK) throw err;
        console.warn('[db] falling back to static seed:', err.message);
        return {
          pets: seedPets().filter(function (p) { return includeDrafts || p.published; }).sort(bySortOrder),
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

  function siteContent() {
    return window.SITE_CONTENT || {};
  }

  /* ------------------------------------------------------- writes (admin) */

  function savePet(pet) {
    if (!CONFIGURED) return Promise.reject(new Error('not-configured'));
    var row = toRow(pet);
    /* on_conflict makes this an upsert keyed on the slug, so the admin has a
       single "save" path for both new and existing records. */
    return request('pets?on_conflict=slug', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(row)
    });
  }

  function deletePet(slug) {
    if (!CONFIGURED) return Promise.reject(new Error('not-configured'));
    return request('pets?slug=eq.' + encodeURIComponent(slug), { method: 'DELETE' });
  }

  window.PetDB = {
    configured: CONFIGURED,
    urlBase: URL_BASE,
    anonKey: ANON,
    listPets: listPets,
    getPet: getPet,
    siteContent: siteContent,
    savePet: savePet,
    deletePet: deletePet,
    normalisePet: normalisePet,
    normaliseTag: normaliseTag,
    toRow: toRow,
    seedPets: seedPets
  };
})();
