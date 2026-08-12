/*
 * Admin panel: create, edit, and delete pet records.
 *
 * Three states, in order: "Supabase isn't configured" -> "sign in" -> editor.
 *
 * Localised fields render one input per language with Russian first, since
 * that is the language cards are authored in and the one everything falls back
 * to. Leaving English and Georgian blank is a supported outcome, not an error;
 * the site renders Russian for those visitors.
 *
 * Nothing here is a security boundary. The UI hides the editor when you are
 * signed out, but the actual protection is Row Level Security in
 * supabase/schema.sql — a forged request from a signed-out browser is rejected
 * by Postgres, not by this file.
 */
(function () {
  'use strict';

  var i18n = window.I18N;
  var UI = window.UI;
  var el = UI.el;
  var LANGS = i18n.LANGS;

  var pets = [];
  var draft = null;        // the record currently open in the editor
  var isNew = false;

  var nodes = {};

  /* ------------------------------------------------------------- plumbing */

  function emptyPet() {
    return {
      slug: '',
      published: false,
      sortOrder: (pets.length + 1) * 10,
      name: {}, subtitle: {}, location: {}, status: {},
      statusType: 'info',
      tags: [],
      mainPhoto: null,
      gallery: [],
      shortDescription: {}, description: {},
      video: null,
      carePlan: [], docs: [],
      donate: { url: '', qr: '', label: {}, note: {} },
      curator: { name: {}, photo: '', photoAlt: {}, bio: {}, email: '', telegram: '', instagram: '', phone: '' },
      sections: []
    };
  }

  function status(message, kind) {
    var host = nodes.status;
    UI.clear(host);
    if (!message) { host.hidden = true; return; }
    host.hidden = false;
    host.className = 'admin-status admin-status-' + (kind || 'info');
    host.textContent = message;
    if (kind === 'ok') setTimeout(function () { if (host.textContent === message) status(''); }, 4000);
  }

  function describeError(err) {
    if (!err) return 'Unknown error';
    if (err.status === 401 || err.status === 403) return i18n.t('adminForbidden');
    return err.message || String(err);
  }

  /* ------------------------------------------------------------- widgets */

  /* One labelled input per language for a {lang: text} map. */
  function localisedField(label, value, opts) {
    opts = opts || {};
    var rows = LANGS.map(function (lang) {
      var input = opts.multiline
        ? el('textarea', { rows: opts.rows || 5, 'data-lang': lang })
        : el('input', { type: 'text', 'data-lang': lang });
      input.value = value[lang] || '';
      input.addEventListener('input', function () {
        var text = input.value;
        if (text) value[lang] = text;
        else delete value[lang];      // keep empties out of the row entirely
      });
      return el('div.lang-row', {}, [
        el('span.lang-tag' + (lang === i18n.FALLBACK ? '.lang-tag-primary' : ''), { text: lang.toUpperCase() }),
        input
      ]);
    });

    return el('div.field', {}, [
      el('label.field-label', { text: label }),
      opts.hint ? el('p.field-hint', { text: opts.hint }) : null,
      el('div.lang-stack', {}, rows)
    ]);
  }

  /* A plain (non-localised) text input bound to obj[key]. */
  function textField(label, obj, key, opts) {
    opts = opts || {};
    var input = el('input', {
      type: opts.type || 'text',
      placeholder: opts.placeholder || ''
    });
    input.value = obj[key] || '';
    input.addEventListener('input', function () { obj[key] = input.value.trim(); });
    return el('div.field', {}, [
      el('label.field-label', { text: label }),
      opts.hint ? el('p.field-hint', { text: opts.hint }) : null,
      input
    ]);
  }

  function selectField(label, obj, key, options) {
    var select = el('select');
    options.forEach(function (opt) {
      var o = el('option', { value: opt.value, text: opt.label });
      if ((obj[key] || '') === opt.value) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', function () { obj[key] = select.value; });
    return el('div.field', {}, [el('label.field-label', { text: label }), select]);
  }

  function checkboxField(label, obj, key) {
    var input = el('input', { type: 'checkbox' });
    input.checked = !!obj[key];
    input.addEventListener('change', function () { obj[key] = input.checked; });
    return el('label.check-field', {}, [input, el('span', { text: label })]);
  }

  /*
   * Repeating sub-records (gallery, tags, care plan, docs, sections).
   * `render` draws one item; add/remove/reorder are handled here so every
   * list behaves identically.
   */
  function repeater(label, list, makeItem, render, opts) {
    opts = opts || {};
    var body = el('div.repeater-body');

    function redraw() {
      UI.clear(body);
      if (!list.length) {
        body.appendChild(el('p.field-hint.empty-hint', { text: opts.emptyText || '—' }));
      }
      list.forEach(function (item, index) {
        var controls = el('div.repeater-controls', {}, [
          el('button.icon-btn', {
            type: 'button', title: 'Up', 'aria-label': 'Move up',
            disabled: index === 0,
            onclick: function () {
              list.splice(index - 1, 0, list.splice(index, 1)[0]);
              redraw();
            }
          }, el('i.fa-solid.fa-arrow-up', { 'aria-hidden': 'true' })),
          el('button.icon-btn', {
            type: 'button', title: 'Down', 'aria-label': 'Move down',
            disabled: index === list.length - 1,
            onclick: function () {
              list.splice(index + 1, 0, list.splice(index, 1)[0]);
              redraw();
            }
          }, el('i.fa-solid.fa-arrow-down', { 'aria-hidden': 'true' })),
          el('button.icon-btn.icon-btn-danger', {
            type: 'button', title: 'Remove', 'aria-label': 'Remove',
            onclick: function () { list.splice(index, 1); redraw(); }
          }, el('i.fa-solid.fa-trash', { 'aria-hidden': 'true' }))
        ]);

        body.appendChild(el('div.repeater-item', {}, [
          el('div.repeater-head', {}, [
            el('span.repeater-index', { text: '#' + (index + 1) }),
            controls
          ]),
          render(item, index, redraw)
        ]));
      });
    }

    redraw();

    return el('section.admin-block', {}, [
      el('div.admin-block-head', {}, [
        el('h3', { text: label }),
        el('button.button.button-ghost.button-sm', {
          type: 'button',
          onclick: function () { list.push(makeItem()); redraw(); }
        }, [el('i.fa-solid.fa-plus', { 'aria-hidden': 'true' }), ' Add'])
      ]),
      body
    ]);
  }

  /* --------------------------------------------------------------- media */

  /*
   * Upload to Supabase Storage. Optional — every media field also accepts a
   * plain path like "media/kotik-2026-03-12.webp" for files committed to the
   * repository, which is how the existing photos are served.
   */
  function uploadField(label, obj, key, hint) {
    var input = el('input', { type: 'text', placeholder: 'media/photo.webp' });
    input.value = obj[key] || '';
    input.addEventListener('input', function () { obj[key] = input.value.trim(); });

    var preview = el('img.upload-preview', { alt: '' });
    function syncPreview() {
      if (obj[key]) { preview.src = obj[key]; preview.hidden = false; }
      else preview.hidden = true;
    }
    syncPreview();
    input.addEventListener('input', syncPreview);

    var file = el('input.upload-input', { type: 'file', accept: 'image/*,video/mp4' });
    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      status('Uploading…', 'info');
      uploadToStorage(file.files[0]).then(function (url) {
        obj[key] = url;
        input.value = url;
        syncPreview();
        status('Uploaded.', 'ok');
      }).catch(function (err) {
        status('Upload failed: ' + describeError(err), 'error');
      });
    });

    return el('div.field', {}, [
      el('label.field-label', { text: label }),
      hint ? el('p.field-hint', { text: hint }) : null,
      input,
      el('div.upload-row', {}, [file, preview])
    ]);
  }

  function uploadToStorage(fileObj) {
    var base = window.PetDB.urlBase;
    if (!base) return Promise.reject(new Error('not-configured'));

    /* Date-prefixed name keeps uploads ordered and collision-free without
       needing to read the bucket first. */
    var safe = fileObj.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    var path = (draft && draft.slug ? draft.slug : 'misc') + '/' + Date.now() + '-' + safe;

    return window.PetAuth.ensureFresh().then(function (token) {
      return fetch(base + '/storage/v1/object/pet-media/' + path, {
        method: 'POST',
        headers: {
          apikey: window.PetDB.anonKey,
          Authorization: 'Bearer ' + (token || window.PetDB.anonKey),
          'x-upsert': 'true'
        },
        body: fileObj
      });
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var err = new Error(t || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        });
      }
      return base + '/storage/v1/object/public/pet-media/' + path;
    });
  }

  /* -------------------------------------------------------------- editor */

  function buildEditor() {
    var host = UI.clear(nodes.editor);
    var pet = draft;

    host.appendChild(el('div.admin-block-head.editor-head', {}, [
      el('h2', { text: isNew ? i18n.t('adminNewPet') : (i18n.pick(pet.name) || pet.slug) }),
      el('div.editor-actions', {}, [
        el('button.button.button-ghost', {
          type: 'button', text: i18n.t('adminCancel'),
          onclick: closeEditor
        }),
        el('button.button.button-primary', {
          type: 'button', text: i18n.t('adminSave'),
          onclick: save
        })
      ])
    ]));

    /* --- identity --- */
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Basics' }),
      textField('Slug (URL)', pet, 'slug', {
        hint: 'Latin letters, digits and dashes. The page will be pet.html?slug=…',
        placeholder: 'kotik'
      }),
      el('div.field-row', {}, [
        checkboxField(i18n.t('adminPublished'), pet, 'published'),
        (function () {
          var f = textField('Sort order', pet, 'sortOrder', { type: 'number' });
          f.querySelector('input').addEventListener('input', function (e) {
            pet.sortOrder = parseInt(e.target.value, 10) || 0;
          });
          return f;
        })()
      ]),
      localisedField('Name', pet.name),
      localisedField('Subtitle', pet.subtitle),
      localisedField('Location', pet.location),
      localisedField('Status label', pet.status),
      selectField('Status colour', pet, 'statusType', [
        { value: 'info', label: 'Info (blue)' },
        { value: 'warning', label: 'Warning (amber)' },
        { value: 'success', label: 'Good news (green)' }
      ])
    ]));

    /* --- story --- */
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Story' }),
      localisedField('Short description (shown on the card)', pet.shortDescription, {
        multiline: true, rows: 3
      }),
      localisedField('Full description', pet.description, {
        multiline: true, rows: 12,
        hint: 'Leave a blank line between paragraphs.'
      })
    ]));

    /* --- main photo --- */
    if (!pet.mainPhoto) pet.mainPhoto = { type: 'image', src: '', thumb: '', alt: {} };
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Main photo' }),
      uploadField('Image', pet.mainPhoto, 'src', 'Used on the card and as the first gallery slide.'),
      uploadField('Thumbnail (optional)', pet.mainPhoto, 'thumb'),
      localisedField('Alt text', pet.mainPhoto.alt, {
        hint: 'Describes the photo for screen readers and search engines.'
      })
    ]));

    /* --- gallery --- */
    host.appendChild(repeater('Gallery', pet.gallery,
      function () { return { type: 'image', src: '', thumb: '', alt: {} }; },
      function (item) {
        return el('div', {}, [
          selectField('Type', item, 'type', [
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video file (mp4)' },
            { value: 'youtube', label: 'YouTube' }
          ]),
          item.type === 'youtube'
            ? textField('YouTube video ID', item, 'id', { placeholder: 'dQw4w9WgXcQ' })
            : uploadField('File', item, 'src'),
          uploadField('Thumbnail', item, 'thumb'),
          localisedField('Alt text', item.alt)
        ]);
      },
      { emptyText: 'No photos yet. Add at least one — the card looks empty without it.' }
    ));

    /* --- video reel --- */
    if (!pet.video) pet.video = { type: 'youtube', id: '', src: '', thumb: '', alt: {} };
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Video reel' }),
      el('p.field-hint', { text: 'Leave the ID and file blank to hide the video section entirely.' }),
      selectField('Type', pet.video, 'type', [
        { value: 'youtube', label: 'YouTube' },
        { value: 'video', label: 'Video file (mp4)' }
      ]),
      textField('YouTube video ID', pet.video, 'id', { placeholder: 'e.g. M7lc1UVf-VE' }),
      uploadField('or video file', pet.video, 'src'),
      uploadField('Poster image', pet.video, 'thumb'),
      localisedField('Alt text', pet.video.alt)
    ]));

    /* --- tags --- */
    host.appendChild(repeater('Tags', pet.tags,
      function () { return { id: '', ru: '', en: '', ka: '' }; },
      function (item) {
        return el('div', {}, [
          textField('Tag id', item, 'id', {
            hint: 'Stable key used for filtering, e.g. "fiv". Never translated.',
            placeholder: 'fiv'
          }),
          localisedField('Label', item)
        ]);
      },
      { emptyText: 'No tags. Tags power the search filters on the main page.' }
    ));

    /* --- care plan --- */
    host.appendChild(repeater('Medical status & plan', pet.carePlan,
      function () { return { state: 'needed', title: {}, desc: {} }; },
      function (item) {
        return el('div', {}, [
          selectField('State', item, 'state', [
            { value: 'needed', label: 'Needed' },
            { value: 'done', label: 'Done' }
          ]),
          localisedField('Title', item.title),
          localisedField('Detail', item.desc, { multiline: true, rows: 2 })
        ]);
      },
      { emptyText: 'No treatment steps listed.' }
    ));

    /* --- documents --- */
    host.appendChild(repeater('Documents', pet.docs,
      function () { return { href: '', label: {}, sub: {} }; },
      function (item) {
        return el('div', {}, [
          uploadField('File', item, 'href', 'Scan or photo of the test result.'),
          localisedField('Title', item.label),
          localisedField('Subtitle', item.sub)
        ]);
      },
      { emptyText: 'No documents attached.' }
    ));

    /* --- donation --- */
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Donation' }),
      textField('Donation link', pet.donate, 'url', { placeholder: 'https://…' }),
      uploadField('QR code image', pet.donate, 'qr'),
      localisedField('Button label', pet.donate.label),
      localisedField('Note above the button', pet.donate.note, { multiline: true, rows: 3 })
    ]));

    /* --- curator --- */
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Curator' }),
      localisedField('Name', pet.curator.name),
      uploadField('Photo', pet.curator, 'photo'),
      localisedField('Photo alt text', pet.curator.photoAlt),
      localisedField('Bio', pet.curator.bio, { multiline: true, rows: 4 }),
      textField('Email', pet.curator, 'email', { type: 'email' }),
      textField('Telegram URL', pet.curator, 'telegram', { placeholder: 'https://t.me/…' }),
      textField('Instagram URL', pet.curator, 'instagram', { placeholder: 'https://instagram.com/…' }),
      textField('Phone', pet.curator, 'phone', { type: 'tel' })
    ]));

    /* --- free-form sections --- */
    host.appendChild(repeater('Extra sections', pet.sections,
      function () { return { icon: 'fa-circle-info', title: {}, body: {} }; },
      function (item) {
        return el('div', {}, [
          textField('Icon (Font Awesome)', item, 'icon', { placeholder: 'fa-guitar' }),
          localisedField('Title', item.title),
          localisedField('Body', item.body, { multiline: true, rows: 5 })
        ]);
      },
      { emptyText: 'No extra sections.' }
    ));

    nodes.editorWrap.hidden = false;
    nodes.listWrap.hidden = true;
    window.scrollTo(0, 0);
  }

  function openEditor(pet, creating) {
    /* Deep copy so Cancel really discards — editing the live object would
       leave half-typed changes in the list behind. */
    draft = JSON.parse(JSON.stringify(pet));
    isNew = !!creating;
    buildEditor();
  }

  function closeEditor() {
    draft = null;
    nodes.editorWrap.hidden = true;
    nodes.listWrap.hidden = false;
    status('');
  }

  /* --------------------------------------------------------------- save */

  function save() {
    if (!draft.slug || !/^[a-z0-9-]+$/.test(draft.slug)) {
      status('Slug is required and may contain only lowercase letters, digits and dashes.', 'error');
      return;
    }
    if (!i18n.pick(draft.name)) {
      status('A name in at least one language is required.', 'error');
      return;
    }

    /* Drop the placeholder objects the editor created so empty sections stay
       absent from the database rather than saved as blanks. */
    var payload = JSON.parse(JSON.stringify(draft));
    if (payload.video && !payload.video.id && !payload.video.src) payload.video = null;
    if (payload.mainPhoto && !payload.mainPhoto.src) payload.mainPhoto = null;
    payload.gallery = payload.gallery.filter(function (g) { return g.src || g.id; });
    payload.tags = payload.tags.filter(function (t) { return t.id; });
    payload.docs = payload.docs.filter(function (d) { return d.href; });

    status('Saving…', 'info');
    window.PetAuth.ensureFresh()
      .then(function () { return window.PetDB.savePet(payload); })
      .then(function () {
        status(i18n.t('adminSaved'), 'ok');
        return reload();
      })
      .then(closeEditor)
      .catch(function (err) { status(describeError(err), 'error'); });
  }

  function remove(pet) {
    var name = i18n.pick(pet.name) || pet.slug;
    if (!window.confirm(i18n.t('adminConfirmDelete', { name: name }))) return;

    status('Deleting…', 'info');
    window.PetAuth.ensureFresh()
      .then(function () { return window.PetDB.deletePet(pet.slug); })
      .then(function () {
        status(i18n.t('adminDeleted'), 'ok');
        return reload();
      })
      .catch(function (err) { status(describeError(err), 'error'); });
  }

  /* --------------------------------------------------------------- list */

  function renderList() {
    var host = UI.clear(nodes.list);

    if (!pets.length) {
      host.appendChild(el('p.field-hint', { text: 'No records yet.' }));
      return;
    }

    pets.forEach(function (pet) {
      var langs = i18n.langsPresent(pet.name).concat(i18n.langsPresent(pet.description))
        .filter(function (v, i, a) { return a.indexOf(v) === i; });

      host.appendChild(el('div.admin-entry', {}, [
        el('img.admin-entry-thumb', {
          src: (pet.mainPhoto && (pet.mainPhoto.thumb || pet.mainPhoto.src)) || '',
          alt: '', loading: 'lazy'
        }),
        el('div.admin-entry-main', {}, [
          el('strong', { text: i18n.pick(pet.name) || pet.slug }),
          el('span.admin-entry-slug', { text: pet.slug }),
          el('div.admin-entry-meta', {}, [
            el('span.pill' + (pet.published ? '.pill-ok' : ''), {
              text: pet.published ? i18n.t('adminPublished') : i18n.t('adminDraft')
            }),
            el('span.pill', { text: pet.gallery.length + ' photo(s)' }),
            el('span.pill', { text: langs.join(', ').toUpperCase() || 'RU' })
          ])
        ]),
        el('div.admin-entry-actions', {}, [
          el('a.button.button-ghost.button-sm', {
            href: UI.petUrl(pet.slug), target: '_blank', rel: 'noopener', text: 'View'
          }),
          el('button.button.button-ghost.button-sm', {
            type: 'button', text: i18n.t('adminEdit'),
            onclick: function () { openEditor(pet, false); }
          }),
          el('button.button.button-danger.button-sm', {
            type: 'button', text: i18n.t('adminDelete'),
            onclick: function () { remove(pet); }
          })
        ])
      ]));
    });
  }

  function reload() {
    return window.PetDB.listPets({ includeDrafts: true }).then(function (result) {
      pets = result.pets;
      renderList();
      if (result.stale) {
        status('Read from the local seed — could not reach Supabase. Saving will fail until it is reachable.', 'error');
      }
    });
  }

  /* Exports the current records in data/pets.js format, so the static fallback
     can be kept in step with the database and committed to the repo. */
  function exportSeed() {
    var body = 'window.PETS_SEED = ' +
      JSON.stringify(pets.map(function (p) {
        var copy = JSON.parse(JSON.stringify(p));
        delete copy.mainPhoto;                 // rebuilt from gallery[0] on load
        return copy;
      }), null, 2) + ';\n';

    var blob = new Blob([body], { type: 'text/javascript' });
    var link = el('a', { href: window.URL.createObjectURL(blob), download: 'pets.js' });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
    status('Downloaded pets.js — put it in data/ and commit to update the offline fallback.', 'ok');
  }

  /* --------------------------------------------------------------- auth */

  function showSignIn() {
    nodes.authWrap.hidden = false;
    nodes.appWrap.hidden = true;
  }

  function showApp() {
    nodes.authWrap.hidden = true;
    nodes.appWrap.hidden = false;
    var user = window.PetAuth.user();
    nodes.who.textContent = user && user.email ? user.email : '';
    reload();
  }

  function wireAuth() {
    nodes.signInForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = nodes.email.value.trim();
      var password = nodes.password.value;
      status('');
      nodes.authError.hidden = true;

      window.PetAuth.signIn(email, password).then(showApp).catch(function (err) {
        nodes.authError.hidden = false;
        nodes.authError.textContent = err.status === 400
          ? i18n.t('adminBadCreds')
          : describeError(err);
      });
    });

    nodes.signOut.addEventListener('click', function () {
      window.PetAuth.signOut().then(showSignIn);
    });
  }

  /* --------------------------------------------------------------- init */

  function init() {
    nodes = {
      notConfigured: document.getElementById('not-configured'),
      authWrap: document.getElementById('auth-wrap'),
      appWrap: document.getElementById('app-wrap'),
      signInForm: document.getElementById('sign-in-form'),
      email: document.getElementById('admin-email'),
      password: document.getElementById('admin-password'),
      authError: document.getElementById('auth-error'),
      signOut: document.getElementById('sign-out'),
      who: document.getElementById('admin-who'),
      list: document.getElementById('admin-list'),
      listWrap: document.getElementById('list-wrap'),
      editor: document.getElementById('admin-editor'),
      editorWrap: document.getElementById('editor-wrap'),
      status: document.getElementById('admin-status'),
      newPet: document.getElementById('new-pet'),
      exportSeed: document.getElementById('export-seed')
    };

    UI.initLangSwitcher();
    UI.translateStatic();

    if (!window.PetAuth.configured) {
      nodes.notConfigured.hidden = false;
      nodes.authWrap.hidden = true;
      nodes.appWrap.hidden = true;
      return;
    }

    wireAuth();
    nodes.newPet.addEventListener('click', function () { openEditor(emptyPet(), true); });
    nodes.exportSeed.addEventListener('click', exportSeed);
    UI.onLangChange(function () {
      UI.translateStatic();
      if (draft) buildEditor(); else renderList();
    });

    /* A stored session may have expired while the tab was closed; refresh
       before deciding which screen to show. */
    if (window.PetAuth.isSignedIn()) {
      window.PetAuth.ensureFresh().then(function (token) {
        if (token) showApp(); else showSignIn();
      });
    } else {
      showSignIn();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
