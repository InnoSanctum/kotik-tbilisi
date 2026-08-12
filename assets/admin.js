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
  var gigs = [];
  var catalogues = { tags: [], curators: [], donations: [] };
  var mode = 'pets';       // which tab is showing: 'pets' or 'gigs'
  var draft = null;        // the record currently open in the editor
  var isNew = false;
  var slugTouched = false; // has the curator typed a slug by hand?

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
      donate: { slug: '', url: '', qr: '', label: {}, note: {} },
      donationId: null,
      curator: { slug: '', name: {}, photo: '', photoAlt: {}, bio: {}, email: '', telegram: '', instagram: '', phone: '' },
      curatorId: null,
      sections: []
    };
  }

  function emptyGig() {
    return {
      slug: '',
      published: false,
      sortOrder: 0,
      date: '',
      petSlugs: [],
      title: {}, venue: {}, description: {},
      link: '',
      mainPhoto: null,
      gallery: []
    };
  }

  /* Every slug currently in use in the active tab, so a generated one can
     avoid them. Pets and gigs are separate tables, so their slugs are
     independent — a gig may share a slug with a pet without conflict. */
  function takenSlugs() {
    var list = mode === 'gigs' ? gigs : pets;
    return list.map(function (r) { return r.slug; }).filter(Boolean);
  }

  /* The record's display name, whichever kind it is. */
  function recordTitle(record) {
    return i18n.pick(record.name || record.title) || record.slug;
  }

  /*
   * Derive the slug from the name until the curator overrides it by hand.
   *
   * Names are Russian, so this transliterates: "Барсик" -> "barsik". A second
   * Барсик becomes "barsik-2" rather than silently overwriting the first —
   * the slug is the primary key, so a collision would replace a live record.
   */
  function refreshAutoSlug(input) {
    if (slugTouched) return;
    var field = draft.name || draft.title;
    var source = window.I18N.pick(field, window.I18N.FALLBACK) || window.I18N.pick(field);
    if (!source) return;
    draft.slug = window.PetSlug.unique(source, takenSlugs(), isNew ? null : draft.slug);
    if (input) input.value = draft.slug;
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
        if (opts.onChange) opts.onChange(value, lang);
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

  /* ------------------------------------------------------------- pickers */

  /*
   * Reusable "pick an existing record, or start a new one" control.
   *
   * The selected record's fields stay editable inline, and saving the pet
   * writes them back to the shared table. So the same control both reuses a
   * curator and corrects their Telegram handle everywhere at once.
   */
  function recordSelect(label, list, currentSlug, onPick) {
    var select = el('select');
    select.appendChild(el('option', { value: '', text: '— none —' }));
    list.forEach(function (row) {
      var name = i18n.pick(row.name) || i18n.pick(row.label) || row.url || row.slug;
      var option = el('option', { value: row.slug, text: name + '  (' + row.slug + ')' });
      if (row.slug === currentSlug) option.selected = true;
      select.appendChild(option);
    });
    var NEW = ' new';
    select.appendChild(el('option', { value: NEW, text: '+ New…' }));

    select.addEventListener('change', function () {
      if (select.value === NEW) onPick(null);
      else onPick(list.filter(function (r) { return r.slug === select.value; })[0] || null);
    });

    return el('div.field', {}, [el('label.field-label', { text: label }), select]);
  }

  /*
   * Tags: add from the catalogue by typing, or invent a new one.
   *
   * A <datalist> rather than a custom dropdown — it is the browser's own
   * autocomplete, so it works with the keyboard, on mobile, and with screen
   * readers without any of that being reimplemented here.
   */
  function tagPicker(pet) {
    var body = el('div.repeater-body');
    var input = el('input', {
      type: 'text',
      placeholder: 'Start typing: fiv, needs a home…',
      list: 'tag-suggestions',
      autocomplete: 'off'
    });

    var datalist = el('datalist', { id: 'tag-suggestions' });
    catalogues.tags.forEach(function (tag) {
      /* Offer the label people read; the id follows automatically. */
      datalist.appendChild(el('option', {
        value: i18n.pick(tag) || tag.id,
        label: tag.id
      }));
    });

    function has(id) {
      return pet.tags.some(function (t) { return (t.id || t) === id; });
    }

    function add(text) {
      var typed = String(text || '').trim();
      if (!typed) return;

      /* Match the catalogue by id first, then by any language's label, so
         typing either "fiv" or "ВИК (FIV) +" lands on the same tag. */
      var found = null;
      for (var i = 0; i < catalogues.tags.length; i++) {
        var tag = catalogues.tags[i];
        if (tag.id === typed.toLowerCase()) { found = tag; break; }
        var labels = Object.keys(tag).filter(function (k) { return k !== 'id'; });
        for (var j = 0; j < labels.length; j++) {
          if (String(tag[labels[j]]).toLowerCase() === typed.toLowerCase()) { found = tag; break; }
        }
        if (found) break;
      }

      var entry = found ? JSON.parse(JSON.stringify(found))
                        : { id: window.PetSlug.slugify(typed) || 'tag', ru: typed };
      if (has(entry.id)) { status('That tag is already on this animal.', 'info'); return; }

      pet.tags.push(entry);
      input.value = '';
      redraw();
    }

    function redraw() {
      UI.clear(body);
      if (!pet.tags.length) {
        body.appendChild(el('p.field-hint.empty-hint', {
          text: 'No tags yet. Tags are what the filters on the main page are built from.'
        }));
      }
      pet.tags.forEach(function (tag, index) {
        var known = catalogues.tags.some(function (t) { return t.id === tag.id; });
        body.appendChild(el('div.repeater-item', {}, [
          el('div.repeater-head', {}, [
            el('span.repeater-index', {}, [
              el('code', { text: tag.id }),
              known ? el('span.pill.pill-ok', { text: 'saved' })
                    : el('span.pill', { text: 'new' })
            ]),
            el('button.icon-btn.icon-btn-danger', {
              type: 'button', 'aria-label': 'Remove tag',
              onclick: function () { pet.tags.splice(index, 1); redraw(); }
            }, el('i.fa-solid.fa-trash', { 'aria-hidden': 'true' }))
          ]),
          localisedField('Label', tag)
        ]));
      });
    }

    redraw();

    return el('section.admin-block', {}, [
      el('div.admin-block-head', {}, [
        el('h3', { text: 'Tags' }),
        el('div.input-with-button', {}, [
          input,
          datalist,
          el('button.button.button-ghost.button-sm', {
            type: 'button',
            onclick: function () { add(input.value); }
          }, [el('i.fa-solid.fa-plus', { 'aria-hidden': 'true' }), ' Add'])
        ])
      ]),
      body
    ]);
  }

  function curatorPicker(pet) {
    var fields = el('div');

    function drawFields() {
      UI.clear(fields);
      var c = pet.curator;
      var known = catalogues.curators.some(function (r) { return r.slug === c.slug; });

      fields.appendChild(el('p.field-hint', {
        text: known
          ? 'Editing a saved curator: changes apply to every animal they look after.'
          : 'New curator — saving this animal adds them to the list for next time.'
      }));

      var slugInput = el('input', { type: 'text', placeholder: 'mykhailo' });
      slugInput.value = c.slug || '';
      slugInput.addEventListener('input', function () { c.slug = slugInput.value.trim(); });

      fields.appendChild(el('div.field', {}, [
        el('label.field-label', { text: 'Curator id' }),
        el('p.field-hint', { text: 'Short latin key. Generated from the name if left empty.' }),
        slugInput
      ]));

      fields.appendChild(localisedField('Name', c.name, {
        onChange: function () {
          /* Only ever fill a blank id: a selected curator's id is their key,
             and rewriting it would point the pet at a different person. */
          if (c.slug) return;
          /* unique(), not slugify(): the id is the upsert key, so a second
             curator also called Михаил would otherwise silently overwrite the
             first one — and take every animal they curate with them. */
          slugInput.value = window.PetSlug.unique(
            i18n.pick(c.name, i18n.FALLBACK) || i18n.pick(c.name),
            catalogues.curators.map(function (r) { return r.slug; })
          );
          c.slug = slugInput.value;
        }
      }));
      fields.appendChild(uploadField('Photo', c, 'photo'));
      fields.appendChild(localisedField('Photo alt text', c.photoAlt));
      fields.appendChild(localisedField('Bio', c.bio, { multiline: true, rows: 4 }));
      fields.appendChild(textField('Email', c, 'email', { type: 'email' }));
      fields.appendChild(textField('Telegram URL', c, 'telegram', { placeholder: 'https://t.me/…' }));
      fields.appendChild(textField('Instagram URL', c, 'instagram', { placeholder: 'https://instagram.com/…' }));
      fields.appendChild(textField('Phone', c, 'phone', { type: 'tel' }));
    }

    drawFields();

    var picker = recordSelect('Use an existing curator', catalogues.curators, pet.curator.slug,
      function (row) {
        pet.curator = row
          ? window.PetDB.normaliseCurator(JSON.parse(JSON.stringify(row)))
          : { slug: '', name: {}, photo: '', photoAlt: {}, bio: {}, email: '', telegram: '', instagram: '', phone: '' };
        pet.curatorId = row ? (row.id || null) : null;
        drawFields();
      });

    return el('section.admin-block', {}, [el('h3', { text: 'Curator' }), picker, fields]);
  }

  function donationPicker(pet) {
    var fields = el('div');

    function drawFields() {
      UI.clear(fields);
      var d = pet.donate;

      var slugInput = el('input', { type: 'text', placeholder: 'kotik-bog' });
      slugInput.value = d.slug || '';
      slugInput.addEventListener('input', function () { d.slug = slugInput.value.trim(); });

      fields.appendChild(el('div.field', {}, [
        el('label.field-label', { text: 'Link id' }),
        el('p.field-hint', { text: 'Short latin key, so the same link can be reused.' }),
        slugInput
      ]));

      var qrBox = el('div.qr-preview');
      var urlInput = el('input', { type: 'url', placeholder: 'https://…' });
      urlInput.value = d.url || '';
      urlInput.addEventListener('input', function () {
        d.url = urlInput.value.trim();
        /* Same reasoning as the curator id: only fill a blank one, and make it
           unique so a second link never overwrites an existing one. */
        if (!d.slug) {
          slugInput.value = window.PetSlug.unique(
            d.url.replace(/^https?:\/\//, ''),
            catalogues.donations.map(function (r) { return r.slug; })
          );
          d.slug = slugInput.value;
        }
        drawQr();
      });

      fields.appendChild(el('div.field', {}, [
        el('label.field-label', { text: 'Donation link' }),
        urlInput
      ]));

      /* Live QR preview of whatever is in the URL box, so a typo is visible
         before it reaches a flyer. */
      function drawQr() {
        if (d.qr) {
          qrBox.innerHTML = '';
          qrBox.appendChild(el('img', { src: d.qr, alt: 'Uploaded QR code' }));
          return;
        }
        if (!d.url) { qrBox.innerHTML = ''; return; }
        window.PetQR.render(qrBox, d.url, { label: 'Donation QR code' });
      }

      fields.appendChild(el('div.field', {}, [
        el('label.field-label', { text: 'QR code' }),
        el('p.field-hint', {
          text: d.qr
            ? 'Using the uploaded image. Clear the field below to go back to the generated one.'
            : 'Generated from the link above, so it can never point somewhere the link does not. Upload an image only to use the bank’s own code.'
        }),
        el('div.qr-row', {}, [
          qrBox,
          el('div.qr-actions', {}, [
            el('button.button.button-ghost.button-sm', {
              type: 'button',
              onclick: function () { downloadQr(d.url, pet.slug); }
            }, [el('i.fa-solid.fa-download', { 'aria-hidden': 'true' }), ' Download SVG'])
          ])
        ])
      ]));

      var upload = uploadField('Or upload a QR image', d, 'qr',
        'Overrides the generated code.');
      upload.querySelector('input[type="text"]').addEventListener('input', drawQr);
      fields.appendChild(upload);

      fields.appendChild(localisedField('Button label', d.label));
      fields.appendChild(localisedField('Note above the button', d.note, { multiline: true, rows: 3 }));

      drawQr();
    }

    drawFields();

    var picker = recordSelect('Use an existing link', catalogues.donations, pet.donate.slug,
      function (row) {
        pet.donate = row
          ? window.PetDB.normaliseDonation(JSON.parse(JSON.stringify(row)))
          : { slug: '', url: '', qr: '', label: {}, note: {} };
        pet.donationId = row ? (row.id || null) : null;
        drawFields();
      });

    return el('section.admin-block', {}, [el('h3', { text: 'Donation' }), picker, fields]);
  }

  function downloadQr(url, name) {
    if (!url) { status('Add a donation link first.', 'info'); return; }
    window.PetQR.svgMarkup(url).then(function (svg) {
      var blob = new Blob([svg], { type: 'image/svg+xml' });
      var link = el('a', { href: window.URL.createObjectURL(blob), download: (name || 'donation') + '-qr.svg' });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);
    }).catch(function (err) { status('Could not generate the QR: ' + describeError(err), 'error'); });
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
    var slugInput = el('input', { type: 'text', placeholder: 'kotik' });
    slugInput.value = pet.slug || '';
    slugInput.addEventListener('input', function () {
      slugTouched = true;               // hand-edited: stop generating
      pet.slug = slugInput.value.trim();
      updateSlugPreview();
    });

    var slugPreview = el('p.field-hint.slug-preview');
    function updateSlugPreview() {
      slugPreview.textContent = pet.slug ? 'pet.html?slug=' + pet.slug : '';
    }
    updateSlugPreview();

    var slugField = el('div.field', {}, [
      el('label.field-label', { text: 'Slug (URL)' }),
      el('p.field-hint', {
        text: 'Filled in automatically from the name. Latin letters, digits and dashes only.'
      }),
      el('div.input-with-button', {}, [
        slugInput,
        el('button.button.button-ghost.button-sm', {
          type: 'button',
          title: 'Regenerate from the name',
          onclick: function () {
            slugTouched = false;
            refreshAutoSlug(slugInput);
            updateSlugPreview();
          }
        }, [el('i.fa-solid.fa-arrows-rotate', { 'aria-hidden': 'true' }), ' Auto'])
      ]),
      slugPreview
    ]);

    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Basics' }),
      slugField,
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
      localisedField('Name', pet.name, {
        onChange: function () { refreshAutoSlug(slugInput); updateSlugPreview(); }
      }),
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
    host.appendChild(tagPicker(pet));

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
    host.appendChild(donationPicker(pet));

    /* --- curator --- */
    host.appendChild(curatorPicker(pet));

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

  /* ---------------------------------------------------------- gig editor */

  function buildGigEditor() {
    var host = UI.clear(nodes.editor);
    var gig = draft;

    host.appendChild(el('div.admin-block-head.editor-head', {}, [
      el('h2', { text: isNew ? i18n.t('adminNewGig') : (i18n.pick(gig.title) || gig.slug) }),
      el('div.editor-actions', {}, [
        el('button.button.button-ghost', { type: 'button', text: i18n.t('adminCancel'), onclick: closeEditor }),
        el('button.button.button-primary', { type: 'button', text: i18n.t('adminSave'), onclick: save })
      ])
    ]));

    var slugInput = el('input', { type: 'text', placeholder: 'vake-park-2026-08-15' });
    slugInput.value = gig.slug || '';
    slugInput.addEventListener('input', function () {
      slugTouched = true;
      gig.slug = slugInput.value.trim();
      updatePreview();
    });

    var preview = el('p.field-hint.slug-preview');
    function updatePreview() {
      preview.textContent = gig.slug ? 'gig.html?slug=' + gig.slug : '';
    }
    updatePreview();

    var dateInput = el('input', { type: 'date' });
    dateInput.value = gig.date || '';
    dateInput.addEventListener('input', function () { gig.date = dateInput.value; });

    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Basics' }),
      el('div.field', {}, [
        el('label.field-label', { text: 'Slug (URL)' }),
        el('p.field-hint', { text: 'Filled in automatically from the title.' }),
        el('div.input-with-button', {}, [
          slugInput,
          el('button.button.button-ghost.button-sm', {
            type: 'button',
            onclick: function () { slugTouched = false; refreshAutoSlug(slugInput); updatePreview(); }
          }, [el('i.fa-solid.fa-arrows-rotate', { 'aria-hidden': 'true' }), ' Auto'])
        ]),
        preview
      ]),
      el('div.field-row', {}, [
        checkboxField(i18n.t('adminPublished'), gig, 'published'),
        el('div.field', {}, [
          el('label.field-label', { text: 'Date' }),
          el('p.field-hint', { text: 'Leave empty if it is not scheduled yet.' }),
          dateInput
        ])
      ]),
      localisedField('Title', gig.title, {
        onChange: function () { refreshAutoSlug(slugInput); updatePreview(); }
      }),
      localisedField('Venue', gig.venue),
      localisedField('Description', gig.description, {
        multiline: true, rows: 8, hint: 'Leave a blank line between paragraphs.'
      }),
      textField('External link', gig, 'link', {
        placeholder: 'https://…', hint: 'Optional: event page, playlist, ticket link.'
      })
    ]));

    /* Which animals this gig raised money for. Checkboxes rather than a
       free-text field so a slug can never be mistyped into a dead link. */
    var petsBox = el('div.check-grid');
    pets.forEach(function (pet) {
      var input = el('input', { type: 'checkbox' });
      input.checked = gig.petSlugs.indexOf(pet.slug) !== -1;
      input.addEventListener('change', function () {
        var at = gig.petSlugs.indexOf(pet.slug);
        if (input.checked && at === -1) gig.petSlugs.push(pet.slug);
        else if (!input.checked && at !== -1) gig.petSlugs.splice(at, 1);
      });
      petsBox.appendChild(el('label.check-field', {}, [
        input, el('span', { text: i18n.pick(pet.name) || pet.slug })
      ]));
    });

    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'In support of' }),
      pets.length
        ? petsBox
        : el('p.field-hint', { text: 'No animals yet — add one first.' })
    ]));

    if (!gig.mainPhoto) gig.mainPhoto = { type: 'image', src: '', thumb: '', alt: {} };
    host.appendChild(el('section.admin-block', {}, [
      el('h3', { text: 'Main photo' }),
      uploadField('Image', gig.mainPhoto, 'src', 'Used on the card and as the first gallery slide.'),
      uploadField('Thumbnail (optional)', gig.mainPhoto, 'thumb'),
      localisedField('Alt text', gig.mainPhoto.alt)
    ]));

    host.appendChild(repeater('Photos and video', gig.gallery,
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
      { emptyText: 'Nothing yet. Photos and clips from the performance go here.' }
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
    /* An existing record's slug is its primary key and its public URL, so it
       counts as deliberate: never regenerate it from under the curator. */
    slugTouched = !creating;
    renderEditor();
  }

  /* One entry point, so the language switch and the open action agree on
     which editor belongs to the current tab. */
  function renderEditor() {
    if (mode === 'gigs') buildGigEditor();
    else buildEditor();
  }

  function closeEditor() {
    draft = null;
    nodes.editorWrap.hidden = true;
    nodes.listWrap.hidden = false;
    status('');
  }

  /* --------------------------------------------------------------- save */

  function save() {
    if (mode === 'gigs') { saveGig(); return; }
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

    var curator = payload.curator || {};
    var donation = payload.donate || {};
    var hasCurator = !!(curator.slug && (i18n.pick(curator.name) || curator.email || curator.telegram));
    var hasDonation = !!(donation.slug && donation.url);

    if (curator.slug && !window.PetSlug.isValid(curator.slug)) {
      status('Curator id must be lowercase latin letters, digits and dashes.', 'error');
      return;
    }
    if (donation.slug && !window.PetSlug.isValid(donation.slug)) {
      status('Link id must be lowercase latin letters, digits and dashes.', 'error');
      return;
    }

    status('Saving…', 'info');

    /*
     * Order matters: the shared records must exist before the pet can point a
     * foreign key at them. Each upsert returns the stored row, which is where
     * the id for that foreign key comes from.
     */
    window.PetAuth.ensureFresh()
      .then(function () { return payload.tags.length ? window.PetDB.saveTags(payload.tags) : null; })
      .then(function () {
        if (!hasCurator) return null;
        return window.PetDB.saveCurator(curator).then(function (rows) {
          if (rows && rows[0] && rows[0].id) payload.curatorId = rows[0].id;
        });
      })
      .then(function () {
        if (!hasDonation) return null;
        return window.PetDB.saveDonation(donation).then(function (rows) {
          if (rows && rows[0] && rows[0].id) payload.donationId = rows[0].id;
        });
      })
      .then(function () { return window.PetDB.savePet(payload); })
      .then(function () {
        status(i18n.t('adminSaved'), 'ok');
        return reload();
      })
      .then(closeEditor)
      .catch(function (err) { status(describeError(err), 'error'); });
  }

  /* Gigs have no shared records to write first, so this is a single upsert. */
  function saveGig() {
    if (!draft.slug || !window.PetSlug.isValid(draft.slug)) {
      status('Slug is required and may contain only lowercase letters, digits and dashes.', 'error');
      return;
    }
    if (!i18n.pick(draft.title)) {
      status('A title in at least one language is required.', 'error');
      return;
    }

    var payload = JSON.parse(JSON.stringify(draft));
    if (payload.mainPhoto && !payload.mainPhoto.src) payload.mainPhoto = null;
    payload.gallery = payload.gallery.filter(function (g) { return g.src || g.id; });
    if (!payload.date) payload.date = '';

    status('Saving…', 'info');
    window.PetAuth.ensureFresh()
      .then(function () { return window.PetDB.saveGig(payload); })
      .then(function () {
        status(i18n.t('adminSaved'), 'ok');
        return reload();
      })
      .then(closeEditor)
      .catch(function (err) { status(describeError(err), 'error'); });
  }

  function remove(pet) {
    var name = recordTitle(pet);
    if (!window.confirm(i18n.t('adminConfirmDelete', { name: name }))) return;

    status('Deleting…', 'info');
    window.PetAuth.ensureFresh()
      .then(function () {
        return mode === 'gigs' ? window.PetDB.deleteGig(pet.slug)
                               : window.PetDB.deletePet(pet.slug);
      })
      .then(function () {
        status(i18n.t('adminDeleted'), 'ok');
        return reload();
      })
      .catch(function (err) { status(describeError(err), 'error'); });
  }

  /* --------------------------------------------------------------- list */

  function renderList() {
    var host = UI.clear(nodes.list);

    /* Keep the heading and the new-record button in step with the tab. */
    nodes.listHeading.textContent = mode === 'gigs' ? i18n.t('gigsTitle') : i18n.t('petsTitle');
    nodes.newRecordLabel.textContent = mode === 'gigs' ? i18n.t('adminNewGig') : i18n.t('adminNewPet');
    nodes.tabPets.classList.toggle('active', mode === 'pets');
    nodes.tabGigs.classList.toggle('active', mode === 'gigs');
    nodes.tabPets.setAttribute('aria-selected', mode === 'pets' ? 'true' : 'false');
    nodes.tabGigs.setAttribute('aria-selected', mode === 'gigs' ? 'true' : 'false');

    if (mode === 'gigs') { renderGigList(host); return; }

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

  function renderGigList(host) {
    if (!gigs.length) {
      host.appendChild(el('p.field-hint', {
        text: 'No performances yet. Add one as soon as the first is booked.'
      }));
      return;
    }

    gigs.forEach(function (gig) {
      var supported = gig.petSlugs
        .map(function (slug) { return pets.filter(function (p) { return p.slug === slug; })[0]; })
        .filter(Boolean)
        .map(function (p) { return i18n.pick(p.name) || p.slug; });

      host.appendChild(el('div.admin-entry', {}, [
        el('img.admin-entry-thumb', {
          src: (gig.mainPhoto && (gig.mainPhoto.thumb || gig.mainPhoto.src)) || '',
          alt: '', loading: 'lazy'
        }),
        el('div.admin-entry-main', {}, [
          el('strong', { text: i18n.pick(gig.title) || gig.slug }),
          el('span.admin-entry-slug', { text: gig.slug }),
          el('div.admin-entry-meta', {}, [
            el('span.pill' + (gig.published ? '.pill-ok' : ''), {
              text: gig.published ? i18n.t('adminPublished') : i18n.t('adminDraft')
            }),
            el('span.pill', { text: gig.date || 'no date' }),
            el('span.pill', { text: gig.gallery.length + ' item(s)' }),
            supported.length ? el('span.pill', { text: supported.join(', ') }) : null
          ])
        ]),
        el('div.admin-entry-actions', {}, [
          el('a.button.button-ghost.button-sm', {
            href: 'gig.html?slug=' + encodeURIComponent(gig.slug),
            target: '_blank', rel: 'noopener', text: 'View'
          }),
          el('button.button.button-ghost.button-sm', {
            type: 'button', text: i18n.t('adminEdit'),
            onclick: function () { openEditor(gig, false); }
          }),
          el('button.button.button-danger.button-sm', {
            type: 'button', text: i18n.t('adminDelete'),
            onclick: function () { remove(gig); }
          })
        ])
      ]));
    });
  }

  function reload() {
    return Promise.all([
      window.PetDB.listPets({ includeDrafts: true }),
      window.PetDB.listGigs({ includeDrafts: true })
    ]).then(function (results) {
      var result = results[0];
      pets = result.pets;
      gigs = results[1].gigs;
      catalogues = result.catalogues || { tags: [], curators: [], donations: [] };
      renderList();
      if (result.stale) {
        status('Read from the local seed — could not reach Supabase. Saving will fail until it is reachable.', 'error');
      }
    });
  }

  /* Exports the current records in data/pets.js format, so the static fallback
     can be kept in step with the database and committed to the repo. */
  function exportSeed() {
    /* Mirrors data/pets.js: the catalogues first, then pets referencing them
       by slug, so the offline fallback keeps the same shared-record structure
       as the database rather than flattening copies back into every animal. */
    var tags = catalogues.tags.map(function (t) {
      var out = { id: t.id };
      var label = t.label || t;
      Object.keys(label).forEach(function (k) { if (k !== 'id' && label[k]) out[k] = label[k]; });
      return out;
    });

    var curators = catalogues.curators.map(function (c) {
      var n = window.PetDB.normaliseCurator(c);
      n.slug = c.slug;
      return n;
    });

    var donations = catalogues.donations.map(function (d) {
      var n = window.PetDB.normaliseDonation(d);
      n.slug = d.slug;
      return n;
    });

    var records = pets.map(function (p) {
      var copy = JSON.parse(JSON.stringify(p));
      /* mainPhoto stays: a pet whose only photo is the main one has no
         gallery[0] for it to be rebuilt from. */
      delete copy.curatorId;
      delete copy.donationId;
      copy.tags = (copy.tags || []).map(function (t) { return t.id; });
      if (copy.curator && copy.curator.slug) copy.curatorSlug = copy.curator.slug;
      if (copy.donate && copy.donate.slug) copy.donationSlug = copy.donate.slug;
      delete copy.curator;
      delete copy.donate;
      return copy;
    });

    var body = '/* Exported from the admin. Replaces data/pets.js. */\n\n' +
      'window.TAGS_SEED = ' + JSON.stringify(tags, null, 2) + ';\n\n' +
      'window.CURATORS_SEED = ' + JSON.stringify(curators, null, 2) + ';\n\n' +
      'window.DONATIONS_SEED = ' + JSON.stringify(donations, null, 2) + ';\n\n' +
      'window.PETS_SEED = ' + JSON.stringify(records, null, 2) + ';\n';

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
      listHeading: document.getElementById('list-heading'),
      newRecordLabel: document.getElementById('new-record-label'),
      tabPets: document.getElementById('tab-pets'),
      tabGigs: document.getElementById('tab-gigs'),
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
    nodes.newPet.addEventListener('click', function () {
      openEditor(mode === 'gigs' ? emptyGig() : emptyPet(), true);
    });

    function switchTo(next) {
      if (mode === next) return;
      mode = next;
      closeEditor();      // a draft belongs to the tab it was opened from
      renderList();
    }
    nodes.tabPets.addEventListener('click', function () { switchTo('pets'); });
    nodes.tabGigs.addEventListener('click', function () { switchTo('gigs'); });
    nodes.exportSeed.addEventListener('click', exportSeed);
    UI.onLangChange(function () {
      UI.translateStatic();
      if (draft) renderEditor(); else renderList();
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
