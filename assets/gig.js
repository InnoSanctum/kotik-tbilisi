/*
 * Gig detail page: photos and video from one fundraising performance.
 *
 * Deliberately thinner than the pet page. A gig is an event, not a case file —
 * it needs a date, a place, a few words, and the media. Every block hides
 * itself when empty, so an announced-but-not-yet-played gig renders as a clean
 * "coming up" page rather than a row of empty headings.
 */
(function () {
  'use strict';

  var i18n = window.I18N;
  var UI = window.UI;
  var el = UI.el;

  var gig = null;
  var pets = [];
  var gallery = null;

  function slugFromUrl() {
    var params = new URLSearchParams(location.search);
    var fromPath = location.pathname.match(/\/gig\/([^/]+)\/?$/);
    return params.get('slug') || (fromPath && decodeURIComponent(fromPath[1])) || '';
  }

  /* Same formatting as the cards on the main page. UTC throughout, so a gig on
     the 15th never renders as the 14th west of Greenwich. */
  function formatDate(iso, lang) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    var when = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    try {
      return when.toLocaleDateString(lang === 'ka' ? 'ka-GE' : lang, {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
      });
    } catch (e) {
      return iso;
    }
  }

  function renderAll() {
    var lang = i18n.getLang();
    var title = i18n.pick(gig.title, lang);

    document.title = title + ' — ' + i18n.t('brand');
    UI.setMeta('description', String(i18n.pick(gig.description, lang) || '').slice(0, 200));
    document.getElementById('gig-title').textContent = title;

    var badges = UI.clear(document.getElementById('gig-badges'));
    badges.appendChild(el('span.badge.badge-' + (gig.upcoming ? 'info' : 'success'), {
      text: gig.upcoming ? i18n.t('gigUpcoming') : i18n.t('gigPast')
    }));

    var meta = UI.clear(document.getElementById('gig-meta'));
    if (gig.date) {
      meta.appendChild(el('span.gig-meta-item', {}, [
        el('i.fa-solid.fa-calendar', { 'aria-hidden': 'true' }), ' ' + formatDate(gig.date, lang)
      ]));
    }
    var venue = i18n.pick(gig.venue, lang);
    if (venue) {
      meta.appendChild(el('span.gig-meta-item', {}, [
        el('i.fa-solid.fa-location-dot', { 'aria-hidden': 'true' }), ' ' + venue
      ]));
    }

    /* The animals this gig raised money for, linked to their pages. */
    var supportsHost = UI.clear(document.getElementById('gig-supports'));
    var supported = gig.petSlugs
      .map(function (slug) { return pets.filter(function (p) { return p.slug === slug; })[0]; })
      .filter(Boolean);
    if (supported.length) {
      supportsHost.appendChild(el('div.gig-supports', {}, [
        el('span.gig-supports-label', { text: i18n.t('gigSupports') + ':' }),
        el('span.tags', {}, supported.map(function (pet) {
          return el('a.tag', { href: UI.petUrl(pet.slug), text: i18n.pick(pet.name, lang) });
        }))
      ]));
    }

    var linkHost = UI.clear(document.getElementById('gig-link'));
    if (gig.link) {
      linkHost.appendChild(el('a.button.button-ghost', {
        href: gig.link, target: '_blank', rel: 'noopener noreferrer'
      }, [el('i.fa-solid.fa-arrow-up-right-from-square', { 'aria-hidden': 'true' }), ' ', i18n.t('gigLink')]));
    }

    var body = UI.clear(document.getElementById('gig-description'));
    var text = i18n.pick(gig.description, lang);
    if (text) {
      body.hidden = false;
      body.appendChild(UI.paragraphs(text, 'bio-text'));
    } else {
      body.hidden = true;
    }

    /* The gallery keeps its own state; re-label rather than rebuild so the
       visitor stays on the slide they were looking at. */
    if (gallery) {
      gallery.setLang(lang);
    } else {
      var host = document.getElementById('gig-gallery');
      if (gig.gallery.length) {
        host.hidden = false;
        gallery = window.PetGallery.mount(host, gig.gallery, lang);
      } else {
        host.hidden = true;
      }
    }
  }

  function renderNotFound() {
    document.getElementById('gig-article').hidden = true;
    var host = document.getElementById('gig-missing');
    host.hidden = false;
    UI.clear(host).appendChild(el('div.empty-state', {}, [
      el('i.fa-solid.fa-guitar', { 'aria-hidden': 'true' }),
      el('h1', { text: i18n.t('notFoundTitle') }),
      el('p', { text: i18n.t('gigNotFound') }),
      el('a.button', { href: 'index.html#gigs', text: i18n.t('backToGigs') })
    ]));
    document.title = i18n.t('notFoundTitle') + ' — ' + i18n.t('brand');
  }

  function init() {
    UI.initLangSwitcher();
    UI.translateStatic();

    var year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    var slug = slugFromUrl();
    if (!slug) { renderNotFound(); return; }

    /* Pets are fetched too, only to turn petSlugs into named links. */
    Promise.all([
      window.PetDB.getGig(slug),
      window.PetDB.listPets()
    ]).then(function (results) {
      if (!results[0].gig) { renderNotFound(); return; }
      gig = results[0].gig;
      pets = results[1].pets;
      if (results[0].stale || results[1].stale) UI.banner(i18n.t('dataStale'), 'warn');
      document.getElementById('gig-article').hidden = false;
      renderAll();
      UI.onLangChange(renderAll);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
