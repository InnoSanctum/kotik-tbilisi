/*
 * Main page: hero, project description, pet cards, tag + keyword search,
 * contacts.
 *
 * All published pets are fetched once and filtered in the browser. For a
 * project of this size that is far cheaper than a round trip per keystroke,
 * and it keeps search working when the site is running off the static seed.
 *
 * Tags filter by their stable `id`, not their label, so a filter chosen in
 * Russian survives a switch to Georgian.
 */
(function () {
  'use strict';

  var i18n = window.I18N;
  var UI = window.UI;
  var el = UI.el;

  var allPets = [];
  var gigs = [];
  var activeTags = [];    // tag ids; a pet must carry every one of them
  var query = '';

  var nodes = {};

  /* ---------------------------------------------------------- filtering */

  function tagLabel(tag) { return i18n.pick(tag, i18n.getLang()); }

  /* Every tag in use, most-used first, so the common filters lead. */
  function collectTags() {
    var seen = {};
    allPets.forEach(function (pet) {
      pet.tags.forEach(function (tag) {
        if (!seen[tag.id]) seen[tag.id] = { tag: tag, count: 0 };
        seen[tag.id].count++;
      });
    });
    return Object.keys(seen)
      .map(function (id) { return seen[id]; })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return tagLabel(a.tag).localeCompare(tagLabel(b.tag));
      });
  }

  /* Match against every language a pet carries, not just the visible one — a
     visitor reading Georgian may well type a name in Russian. */
  function haystack(pet) {
    var parts = [];
    [pet.name, pet.subtitle, pet.location, pet.status, pet.shortDescription].forEach(function (field) {
      Object.keys(field || {}).forEach(function (lang) { parts.push(field[lang]); });
    });
    pet.tags.forEach(function (tag) {
      Object.keys(tag).forEach(function (k) { if (k !== 'id') parts.push(tag[k]); });
      parts.push(tag.id);
    });
    parts.push(pet.slug);
    return parts.join(' ').toLowerCase();
  }

  function matches(pet) {
    if (activeTags.length) {
      var ids = pet.tags.map(function (t) { return t.id; });
      var hasAll = activeTags.every(function (id) { return ids.indexOf(id) !== -1; });
      if (!hasAll) return false;
    }
    if (!query) return true;
    var hay = haystack(pet);
    /* Every whitespace-separated term must appear somewhere. */
    return query.split(/\s+/).filter(Boolean).every(function (term) {
      return hay.indexOf(term) !== -1;
    });
  }

  /* ---------------------------------------------------------- rendering */

  function petCard(pet) {
    var lang = i18n.getLang();
    var name = i18n.pick(pet.name, lang);
    var href = UI.petUrl(pet.slug);

    var media = el('div.pet-image');
    if (pet.mainPhoto && pet.mainPhoto.src) {
      media.appendChild(el('img', {
        src: pet.mainPhoto.src,
        alt: i18n.pick(pet.mainPhoto.alt, lang) || name,
        loading: 'lazy',
        decoding: 'async'
      }));
    }

    var status = i18n.pick(pet.status, lang);
    if (status) {
      media.appendChild(el('span.badge-status.badge-' + pet.statusType, { text: status }));
    }

    var location = i18n.pick(pet.location, lang);
    if (location) {
      media.appendChild(el('span.badge-location', {}, [
        el('i.fa-solid.fa-location-dot', { 'aria-hidden': 'true' }), ' ' + location
      ]));
    }

    /* Show a few tags on the card; the full set lives on the pet page. */
    var chips = pet.tags.slice(0, 3).map(function (tag) {
      return el('span.tag', { text: tagLabel(tag) });
    });

    return el('article.pet-card', {}, [
      el('a.pet-card-link', { href: href, 'aria-label': name }, media),
      el('div.pet-body', {}, [
        el('h3.pet-title', {}, el('a', { href: href, text: name })),
        el('p.pet-subtitle', { text: i18n.pick(pet.subtitle, lang) }),
        el('p.pet-description', { text: i18n.pick(pet.shortDescription, lang) }),
        chips.length ? el('div.tags', {}, chips) : null,
        el('a.button.button-ghost', { href: href }, [
          i18n.t('cardMore'), ' ',
          el('i.fa-solid.fa-arrow-right', { 'aria-hidden': 'true' })
        ])
      ])
    ]);
  }

  function renderTagBar() {
    var host = UI.clear(nodes.tagFilters);
    var tags = collectTags();

    host.appendChild(el('button.filter-pill' + (activeTags.length ? '' : '.active'), {
      type: 'button',
      text: i18n.t('tagAll'),
      'aria-pressed': activeTags.length ? 'false' : 'true',
      onclick: function () { activeTags = []; renderTagBar(); renderList(); }
    }));

    tags.forEach(function (entry) {
      var id = entry.tag.id;
      var on = activeTags.indexOf(id) !== -1;
      host.appendChild(el('button.filter-pill' + (on ? '.active' : ''), {
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        onclick: function () {
          var at = activeTags.indexOf(id);
          if (at === -1) activeTags.push(id);
          else activeTags.splice(at, 1);
          renderTagBar();
          renderList();
        }
      }, [tagLabel(entry.tag), el('span.filter-count', { text: String(entry.count) })]));
    });
  }

  function renderList() {
    var host = UI.clear(nodes.petList);
    var found = allPets.filter(matches);

    nodes.resultCount.textContent = found.length === 1
      ? i18n.t('resultsOne')
      : i18n.t('resultsMany', { n: found.length });

    if (!found.length) {
      host.appendChild(el('div.empty-state', {}, [
        el('i.fa-solid.fa-magnifying-glass', { 'aria-hidden': 'true' }),
        el('p', { text: i18n.t('noResults') }),
        el('button.button.button-ghost', {
          type: 'button',
          text: i18n.t('clearFilters'),
          onclick: function () {
            activeTags = [];
            query = '';
            nodes.search.value = '';
            renderTagBar();
            renderList();
          }
        })
      ]));
      return;
    }

    found.forEach(function (pet) { host.appendChild(petCard(pet)); });
  }

  /* ------------------------------------------------------------- gigs */

  function gigUrl(slug) { return 'gig.html?slug=' + encodeURIComponent(slug); }

  /* '2026-08-15' -> '15 августа 2026', in the visitor's language. */
  function formatDate(iso, lang) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    /* Date.UTC + timeZone:'UTC' so a gig on the 15th never renders as the 14th
       for a visitor west of Greenwich. */
    var when = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    try {
      return when.toLocaleDateString(lang === 'ka' ? 'ka-GE' : lang, {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
      });
    } catch (e) {
      return iso;
    }
  }

  function gigCard(gig) {
    var lang = i18n.getLang();
    var title = i18n.pick(gig.title, lang);
    var href = gigUrl(gig.slug);

    var media = el('div.pet-image');
    if (gig.mainPhoto && gig.mainPhoto.src) {
      media.appendChild(el('img', {
        src: gig.mainPhoto.src,
        alt: i18n.pick(gig.mainPhoto.alt, lang) || title,
        loading: 'lazy', decoding: 'async'
      }));
    } else {
      /* No photo yet — an announced gig still deserves a card. */
      media.appendChild(el('div.gig-placeholder', {}, el('i.fa-solid.fa-guitar', { 'aria-hidden': 'true' })));
    }
    media.appendChild(el('span.badge-status.badge-' + (gig.upcoming ? 'info' : 'success'), {
      text: gig.upcoming ? i18n.t('gigUpcoming') : i18n.t('gigPast')
    }));

    var meta = [];
    if (gig.date) {
      meta.push(el('span.gig-meta-item', {}, [
        el('i.fa-solid.fa-calendar', { 'aria-hidden': 'true' }), ' ' + formatDate(gig.date, lang)
      ]));
    }
    var venue = i18n.pick(gig.venue, lang);
    if (venue) {
      meta.push(el('span.gig-meta-item', {}, [
        el('i.fa-solid.fa-location-dot', { 'aria-hidden': 'true' }), ' ' + venue
      ]));
    }

    /* Which animals it raised money for, linked to their pages. */
    var supported = gig.petSlugs
      .map(function (slug) {
        return allPets.filter(function (p) { return p.slug === slug; })[0];
      })
      .filter(Boolean);

    return el('article.pet-card.gig-card', {}, [
      el('a.pet-card-link', { href: href, 'aria-label': title }, media),
      el('div.pet-body', {}, [
        el('h3.pet-title', {}, el('a', { href: href, text: title })),
        meta.length ? el('div.gig-meta', {}, meta) : null,
        el('p.pet-description', { text: firstParagraph(i18n.pick(gig.description, lang)) }),
        supported.length ? el('div.gig-supports', {}, [
          el('span.gig-supports-label', { text: i18n.t('gigSupports') + ':' }),
          el('span.tags', {}, supported.map(function (pet) {
            return el('a.tag', { href: UI.petUrl(pet.slug), text: i18n.pick(pet.name, lang) });
          }))
        ]) : null,
        el('a.button.button-ghost', { href: href }, [
          i18n.t('gigMore'), ' ', el('i.fa-solid.fa-arrow-right', { 'aria-hidden': 'true' })
        ])
      ])
    ]);
  }

  function firstParagraph(text) {
    return String(text || '').split(/\n\s*\n/)[0].trim();
  }

  function renderGigs() {
    var lang = i18n.getLang();
    var content = window.PetDB.siteContent().gigs || {};

    nodes.gigsTitle.textContent = i18n.pick(content.title, lang) || i18n.t('gigsTitle');
    UI.clear(nodes.gigsBody).appendChild(UI.paragraphs(i18n.pick(content.body, lang)));

    var host = UI.clear(nodes.gigList);
    if (!gigs.length) {
      /* No performances yet is the honest, expected state — say so plainly
         rather than hiding the section that explains the whole idea. */
      host.appendChild(el('div.empty-state', {}, [
        el('i.fa-solid.fa-guitar', { 'aria-hidden': 'true' }),
        el('p', { text: i18n.pick(content.empty, lang) || i18n.t('gigsEmpty') })
      ]));
      return;
    }
    gigs.forEach(function (gig) { host.appendChild(gigCard(gig)); });
  }

  function renderSiteContent() {
    var content = window.PetDB.siteContent();
    var lang = i18n.getLang();

    if (content.hero) {
      if (content.hero.title) nodes.heroTitle.textContent = i18n.pick(content.hero.title, lang);
      if (content.hero.subtitle) nodes.heroSubtitle.textContent = i18n.pick(content.hero.subtitle, lang);
      if (content.hero.image && nodes.heroImage) {
        nodes.heroImage.src = content.hero.image;
        nodes.heroImage.alt = i18n.pick(content.hero.title, lang);
      }
    }

    if (content.about) {
      nodes.aboutTitle.textContent = i18n.pick(content.about.title, lang) || i18n.t('aboutTitle');
      UI.clear(nodes.aboutBody).appendChild(UI.paragraphs(i18n.pick(content.about.body, lang)));
    }

    if (content.contacts) {
      nodes.contactsTitle.textContent = i18n.pick(content.contacts.title, lang) || i18n.t('contactsTitle');
      nodes.contactsBody.textContent = i18n.pick(content.contacts.body, lang) || i18n.t('contactsText');
      UI.clear(nodes.contactsLinks);
      UI.contactLinks(content.contacts).forEach(function (link) {
        nodes.contactsLinks.appendChild(link);
      });
    }
  }

  function renderAll() {
    renderSiteContent();
    renderTagBar();
    renderList();
    renderGigs();
  }

  /* --------------------------------------------------------------- init */

  function init() {
    nodes = {
      heroTitle: document.getElementById('hero-title'),
      heroSubtitle: document.getElementById('hero-subtitle'),
      heroImage: document.getElementById('hero-image'),
      aboutTitle: document.getElementById('about-title'),
      aboutBody: document.getElementById('about-body'),
      search: document.getElementById('search-input'),
      tagFilters: document.getElementById('tag-filters'),
      petList: document.getElementById('pet-list'),
      resultCount: document.getElementById('result-count'),
      contactsTitle: document.getElementById('contacts-title'),
      contactsBody: document.getElementById('contacts-body'),
      contactsLinks: document.getElementById('contacts-links'),
      gigsTitle: document.getElementById('gigs-title'),
      gigsBody: document.getElementById('gigs-body'),
      gigList: document.getElementById('gig-list'),
      year: document.getElementById('footer-year')
    };

    UI.initLangSwitcher();
    UI.translateStatic();
    if (nodes.year) nodes.year.textContent = String(new Date().getFullYear());

    /* Tag links on a pet page point back here as index.html?tag=fiv, so the
       list opens already narrowed to that tag. */
    var wanted = new URLSearchParams(location.search).getAll('tag');
    if (wanted.length) activeTags = wanted;

    nodes.search.addEventListener('input', function () {
      query = nodes.search.value.trim().toLowerCase();
      renderList();
    });

    UI.onLangChange(renderAll);

    /* Both in flight at once: the gig list is independent of the pet list,
       and a slow gigs table should not hold up the cards. */
    Promise.all([
      window.PetDB.listPets(),
      window.PetDB.listGigs()
    ]).then(function (results) {
      allPets = results[0].pets;
      gigs = results[1].gigs;
      if (results[0].stale) UI.banner(i18n.t('dataStale'), 'warn');
      renderAll();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
