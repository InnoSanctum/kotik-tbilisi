/*
 * Shared page chrome: language switcher, static-label translation, and the
 * small DOM helpers the renderers lean on.
 *
 * Pages register a redraw callback with onLangChange(); switching language
 * re-renders in place instead of reloading, so the visitor keeps their scroll
 * position and any open gallery slide.
 */
(function () {
  'use strict';

  var i18n = window.I18N;
  var listeners = [];

  /* ------------------------------------------------------------- helpers */

  /* el('div.card', {...attrs}, child | [children]) */
  function el(spec, attrs, children) {
    var parts = String(spec).split('.');
    var node = document.createElement(parts[0] || 'div');
    if (parts.length > 1) node.className = parts.slice(1).join(' ');

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'class') node.className = node.className ? node.className + ' ' + value : value;
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
      });
    }

    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return node;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(node, c); });
      return node;
    }
    node.appendChild(children.nodeType ? children : document.createTextNode(String(children)));
    return node;
  }

  function clear(node) {
    if (node) node.textContent = '';
    return node;
  }

  /* Render "\n\n"-separated text as real paragraphs. Text goes in via
     textContent, so pet copy can never inject markup. */
  function paragraphs(text, className) {
    var frag = document.createDocumentFragment();
    String(text || '')
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean)
      .forEach(function (p) {
        frag.appendChild(el('p' + (className ? '.' + className : ''), { text: p }));
      });
    return frag;
  }

  /* Pet detail links. Kept in one place so switching to Vercel's clean
     /pet/<slug> rewrite is a one-line change here (see vercel.json). */
  function petUrl(slug) {
    return 'pet.html?slug=' + encodeURIComponent(slug);
  }

  /* -------------------------------------------------------------- labels */

  /* Any element carrying data-i18n="key" gets its text from the string table,
     so static markup stays translatable without per-page wiring. */
  function translateStatic(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = i18n.t(node.getAttribute('data-i18n'));
    });
    (root || document).querySelectorAll('[data-i18n-attr]').forEach(function (node) {
      /* data-i18n-attr="placeholder:searchPlaceholder,aria-label:searchLabel" */
      node.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var bits = pair.split(':');
        if (bits.length === 2) node.setAttribute(bits[0].trim(), i18n.t(bits[1].trim()));
      });
    });
  }

  /* ------------------------------------------------------------ switcher */

  function markActive(lang) {
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var on = btn.dataset.lang === lang;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function initLangSwitcher() {
    document.documentElement.lang = i18n.getLang();
    markActive(i18n.getLang());

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!i18n.setLang(btn.dataset.lang)) return;
        markActive(i18n.getLang());
        translateStatic();
        listeners.forEach(function (fn) {
          try { fn(i18n.getLang()); } catch (e) { console.error(e); }
        });
      });
    });
  }

  function onLangChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /* --------------------------------------------------------------- misc */

  /* A small non-blocking notice, used for "database unreachable, showing
     saved data". Never an alert() — this is a fundraising page, not a form. */
  function banner(message, kind) {
    var host = document.getElementById('site-banner');
    if (!host) return;
    clear(host);
    if (!message) { host.hidden = true; return; }
    host.hidden = false;
    host.appendChild(el('div.banner' + (kind ? '.banner-' + kind : ''), {
      role: 'status'
    }, [el('i.fa-solid.fa-circle-info', { 'aria-hidden': 'true' }), ' ', message]));
  }

  function setMeta(name, content) {
    if (!content) return;
    var tag = document.querySelector('meta[name="' + name + '"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  }

  function contactLinks(source) {
    var out = [];
    if (source.email) {
      out.push(el('a.contact-link', { href: 'mailto:' + source.email }, [
        el('i.fa-solid.fa-envelope', { 'aria-hidden': 'true' }), ' ' + source.email
      ]));
    }
    if (source.telegram) {
      out.push(el('a.contact-link', {
        href: source.telegram, target: '_blank', rel: 'noopener noreferrer'
      }, [
        el('i.fa-brands.fa-telegram', { 'aria-hidden': 'true' }),
        ' ' + handleFrom(source.telegram)
      ]));
    }
    if (source.instagram) {
      out.push(el('a.contact-link', {
        href: source.instagram, target: '_blank', rel: 'noopener noreferrer'
      }, [
        el('i.fa-brands.fa-instagram', { 'aria-hidden': 'true' }),
        ' ' + handleFrom(source.instagram)
      ]));
    }
    if (source.phone) {
      out.push(el('a.contact-link', { href: 'tel:' + source.phone }, [
        el('i.fa-solid.fa-phone', { 'aria-hidden': 'true' }), ' ' + source.phone
      ]));
    }
    return out;
  }

  /* 'https://t.me/innosanctum' -> '@innosanctum' */
  function handleFrom(url) {
    var clean = String(url).replace(/\/+$/, '');
    var last = clean.slice(clean.lastIndexOf('/') + 1);
    return last ? '@' + last : clean;
  }

  window.UI = {
    el: el,
    append: append,
    clear: clear,
    paragraphs: paragraphs,
    petUrl: petUrl,
    translateStatic: translateStatic,
    initLangSwitcher: initLangSwitcher,
    onLangChange: onLangChange,
    banner: banner,
    setMeta: setMeta,
    contactLinks: contactLinks
  };
})();
