/*
 * Pet detail page. Renders whichever pet ?slug= names, from the same record
 * shape the cards use.
 *
 * Every block is optional: a pet with no video, no vet documents, and no care
 * plan renders a clean page rather than a row of empty headings. That matters
 * because most new records will start as just a name, a photo, and a story.
 */
(function () {
  'use strict';

  var i18n = window.I18N;
  var UI = window.UI;
  var el = UI.el;

  var pet = null;
  var gallery = null;

  function slugFromUrl() {
    var params = new URLSearchParams(location.search);
    /* Also accept a /pet/<slug> path, for when this is deployed behind the
       Vercel rewrite in vercel.json. */
    var fromPath = location.pathname.match(/\/pet\/([^/]+)\/?$/);
    return params.get('slug') || (fromPath && decodeURIComponent(fromPath[1])) || '';
  }

  /* -------------------------------------------------------------- blocks */

  function renderHeader(lang) {
    var name = i18n.pick(pet.name, lang);

    document.title = name + ' — ' + i18n.t('brand');
    UI.setMeta('description', i18n.pick(pet.shortDescription, lang));
    document.getElementById('pet-name').textContent = name;
    document.getElementById('pet-subtitle').textContent = i18n.pick(pet.subtitle, lang);

    var badges = UI.clear(document.getElementById('pet-badges'));
    var location = i18n.pick(pet.location, lang);
    if (location) {
      badges.appendChild(el('span.badge.badge-muted', {}, [
        el('i.fa-solid.fa-location-dot', { 'aria-hidden': 'true' }), ' ' + location
      ]));
    }
    var status = i18n.pick(pet.status, lang);
    if (status) {
      badges.appendChild(el('span.badge.badge-' + pet.statusType, { text: status }));
    }

    var tagHost = UI.clear(document.getElementById('pet-tags'));
    pet.tags.forEach(function (tag) {
      /* Tags link back to the list pre-filtered, so they act as navigation
         rather than decoration. */
      tagHost.appendChild(el('a.tag', {
        href: 'index.html?tag=' + encodeURIComponent(tag.id),
        text: i18n.pick(tag, lang)
      }));
    });
  }

  function renderStory(lang) {
    var host = UI.clear(document.getElementById('pet-story'));
    var text = i18n.pick(pet.description, lang);
    if (!text) { host.hidden = true; return; }
    host.hidden = false;
    host.appendChild(el('h2.section-title', {}, [
      el('i.fa-solid.fa-book-open', { 'aria-hidden': 'true' }), ' ' + i18n.t('storyTitle')
    ]));
    host.appendChild(UI.paragraphs(text, 'bio-text'));
  }

  function renderDonate(lang) {
    var host = UI.clear(document.getElementById('pet-donate'));
    if (!pet.donate.url && !pet.donate.qr) { host.hidden = true; return; }
    host.hidden = false;

    host.appendChild(el('h2', { text: i18n.t('donateTitle') }));

    var note = i18n.pick(pet.donate.note, lang);
    if (note) host.appendChild(el('p.donate-note', { text: note }));

    if (pet.donate.url) {
      host.appendChild(el('a.donate-btn', {
        href: pet.donate.url, target: '_blank', rel: 'noopener noreferrer'
      }, [
        el('i.fa-solid.fa-heart', { 'aria-hidden': 'true' }), ' ',
        i18n.pick(pet.donate.label, lang) || i18n.t('donateButton')
      ]));
    }

    if (pet.donate.qr) {
      host.appendChild(el('div.qr-wrapper', {}, [
        el('div.qr-code', {}, el('img', {
          src: pet.donate.qr,
          alt: i18n.pick(pet.donate.label, lang) || i18n.t('donateButton'),
          loading: 'lazy'
        })),
        el('div.qr-caption', { text: i18n.t('qrCaption') })
      ]));
    }
  }

  function renderVideo(lang) {
    var host = UI.clear(document.getElementById('pet-video'));
    if (!pet.video) { host.hidden = true; return; }
    host.hidden = false;

    host.appendChild(el('h2.section-title', {}, [
      el('i.fa-solid.fa-film', { 'aria-hidden': 'true' }), ' ' + i18n.t('videoTitle')
    ]));

    var frame = el('div.video-embed');
    host.appendChild(frame);
    /* Reuse the gallery's YouTube facade so the heavy iframe still loads only
       on click. */
    window.PetGallery.mount(frame, [pet.video], lang);
  }

  function renderCarePlan(lang) {
    var host = UI.clear(document.getElementById('pet-care'));
    if (!pet.carePlan.length) { host.hidden = true; return; }
    host.hidden = false;

    host.appendChild(el('h2.section-title', {}, [
      el('i.fa-solid.fa-stethoscope', { 'aria-hidden': 'true' }), ' ' + i18n.t('carePlanTitle')
    ]));

    var list = el('div.medical-list');
    pet.carePlan.forEach(function (step) {
      list.appendChild(el('div.medical-item.' + step.state, {}, [
        el('div.item-info', {}, [
          el('span.item-title', { text: i18n.pick(step.title, lang) }),
          el('span.item-desc', { text: i18n.pick(step.desc, lang) })
        ]),
        el('span.item-badge', {
          text: step.state === 'done' ? i18n.t('statusDone') : i18n.t('statusNeeded')
        })
      ]));
    });
    host.appendChild(list);
  }

  function renderDocs(lang) {
    var host = UI.clear(document.getElementById('pet-docs'));
    if (!pet.docs.length) { host.hidden = true; return; }
    host.hidden = false;

    host.appendChild(el('h2.section-title', {}, [
      el('i.fa-solid.fa-file-medical', { 'aria-hidden': 'true' }), ' ' + i18n.t('docsTitle')
    ]));

    var grid = el('div.docs-grid');
    pet.docs.forEach(function (doc) {
      grid.appendChild(el('a.doc-link', {
        href: doc.href, target: '_blank', rel: 'noopener noreferrer'
      }, [
        el('i.fa-solid.fa-file-image.doc-icon', { 'aria-hidden': 'true' }),
        el('div.doc-text', {}, [
          el('span.doc-title', { text: i18n.pick(doc.label, lang) }),
          el('span.doc-sub', { text: i18n.pick(doc.sub, lang) })
        ])
      ]));
    });
    host.appendChild(grid);
  }

  function renderSections(lang) {
    var host = UI.clear(document.getElementById('pet-sections'));
    if (!pet.sections.length) { host.hidden = true; return; }
    host.hidden = false;

    pet.sections.forEach(function (section) {
      host.appendChild(el('div.info-block', {}, [
        el('h3', {}, [
          el('i.fa-solid.' + section.icon, { 'aria-hidden': 'true' }), ' ',
          i18n.pick(section.title, lang)
        ]),
        UI.paragraphs(i18n.pick(section.body, lang))
      ]));
    });
  }

  function renderCurator(lang) {
    var host = UI.clear(document.getElementById('pet-curator'));
    var c = pet.curator;
    var name = i18n.pick(c.name, lang);
    if (!name && !c.email && !c.telegram) { host.hidden = true; return; }
    host.hidden = false;

    host.appendChild(el('h2.section-title', {}, [
      el('i.fa-solid.fa-user', { 'aria-hidden': 'true' }), ' ' + i18n.t('curatorTitle')
    ]));

    var text = el('div.author-text', {}, [
      el('div.author-name', { text: name }),
      el('p.author-bio', { text: i18n.pick(c.bio, lang) }),
      el('div.author-contacts', {}, UI.contactLinks(c))
    ]);

    host.appendChild(el('div.author-body', {}, [
      c.photo ? el('img.author-photo', {
        src: c.photo,
        alt: i18n.pick(c.photoAlt, lang) || name,
        width: 120, height: 120, loading: 'lazy', decoding: 'async'
      }) : null,
      text
    ]));
  }

  function renderGallery(lang) {
    var host = document.getElementById('pet-gallery');
    if (!pet.gallery.length) { host.hidden = true; return; }
    host.hidden = false;
    gallery = window.PetGallery.mount(host, pet.gallery, lang);
  }

  /* --------------------------------------------------------------- draw */

  function renderAll() {
    var lang = i18n.getLang();
    renderHeader(lang);
    renderStory(lang);
    renderDonate(lang);
    renderCarePlan(lang);
    renderDocs(lang);
    renderSections(lang);
    renderCurator(lang);
    renderVideo(lang);
    /* The gallery keeps its own state; re-label rather than rebuild so the
       visitor stays on the slide they were looking at. */
    if (gallery) gallery.setLang(lang);
    else renderGallery(lang);
  }

  function renderNotFound() {
    document.getElementById('pet-article').hidden = true;
    var host = document.getElementById('pet-missing');
    host.hidden = false;
    UI.clear(host).appendChild(el('div.empty-state', {}, [
      el('i.fa-solid.fa-cat', { 'aria-hidden': 'true' }),
      el('h1', { text: i18n.t('notFoundTitle') }),
      el('p', { text: i18n.t('notFoundText') }),
      el('a.button', { href: 'index.html', text: i18n.t('backToList') })
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

    window.PetDB.getPet(slug).then(function (result) {
      if (!result.pet) { renderNotFound(); return; }
      pet = result.pet;
      if (result.stale) UI.banner(i18n.t('dataStale'), 'warn');
      document.getElementById('pet-article').hidden = false;
      renderAll();
      UI.onLangChange(renderAll);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
